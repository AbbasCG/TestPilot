<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Private evidence storage. Files never live under a public path: they are
 * written with random names to the "evidence" disk (project-prefixed) and
 * only streamed back through download(), which re-checks project
 * membership and records an audit entry.
 */
class EvidenceService
{
    public function __construct(private ProjectService $audit) {}

    /**
     * @param  array{issue_id?: int|null, step_result_id?: int|null, retest_attempt_id?: int|null}  $target
     */
    public function store(Project $project, User $actor, UploadedFile $file, string $kind, array $target): int
    {
        $issueId = $target['issue_id'] ?? null;
        $stepResultId = $target['step_result_id'] ?? null;
        $retestId = $target['retest_attempt_id'] ?? null;
        if (count(array_filter([$issueId, $stepResultId, $retestId])) !== 1) {
            throw ValidationException::withMessages(['target' => 'اربط الدليل بمشكلة أو نتيجة خطوة أو محاولة إعادة اختبار واحدة.']);
        }
        [$mime, $extension, $bytes] = $this->inspect($file, $kind);
        $stored = $project->id.'/'.bin2hex(random_bytes(20)).'.'.$extension;

        try {
            if ($bytes !== null) {
                Storage::disk('evidence')->put($stored, $bytes);
                $size = strlen($bytes);
                $hash = hash('sha256', $bytes);
            } else {
                $stream = fopen($file->getRealPath(), 'rb');
                Storage::disk('evidence')->writeStream($stored, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
                $size = (int) $file->getSize();
                $hash = (string) hash_file('sha256', $file->getRealPath());
            }

            return DB::transaction(function () use ($project, $actor, $kind, $issueId, $stepResultId, $retestId, $stored, $mime, $extension, $file, $size, $hash) {
                $project = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
                Gate::forUser($actor)->authorize('designTests', $project);
                abort_if($project->status === 'archived', 422, 'أعد تفعيل المشروع قبل رفع الأدلة.');
                $issueForTimeline = null;
                if ($issueId) {
                    $issue = DB::table('issues')->where('project_id', $project->id)->where('id', $issueId)->lockForUpdate()->first();
                    abort_unless($issue, 404);
                    abort_if($issue->status === 'closed', 409, 'أعد فتح المشكلة قبل إضافة أدلة.');
                    $issueForTimeline = $issueId;
                }
                if ($stepResultId) {
                    $result = DB::table('step_results')->join('test_runs', 'test_runs.id', '=', 'step_results.test_run_id')
                        ->where('test_runs.project_id', $project->id)->where('step_results.id', $stepResultId)
                        ->lockForUpdate()->first(['step_results.*', 'test_runs.status as run_status']);
                    abort_unless($result, 404);
                    $participant = DB::table('run_participants')->find($result->participant_id);
                    abort_unless($participant && (int) $participant->user_id === $actor->id, 403, 'ارفع دليل خطوتك فقط.');
                    abort_unless($result->run_status === 'active', 409, 'الجلسة متوقفة أو منتهية.');
                }
                if ($retestId) {
                    $attempt = DB::table('retest_attempts')->where('project_id', $project->id)->where('id', $retestId)->lockForUpdate()->first();
                    abort_unless($attempt, 404);
                    abort_unless((int) $attempt->assignee_id === $actor->id, 403, 'يرفع أدلة إعادة الاختبار المختبرُ المكلَّف بها فقط.');
                    abort_unless($attempt->status === 'pending', 409, 'محاولة إعادة الاختبار مكتملة.');
                    $issueForTimeline = (int) $attempt->issue_id;
                }
                $column = $issueId ? 'issue_id' : ($stepResultId ? 'step_result_id' : 'retest_attempt_id');
                abort_if(DB::table('evidence_files')->where($column, $issueId ?? $stepResultId ?? $retestId)->count() >= config('evidence.max_per_owner'), 422, 'بلغ هذا العنصر الحد الأقصى للأدلة.');
                abort_if((int) DB::table('evidence_files')->where('project_id', $project->id)->sum('size') + $size > config('evidence.max_project_bytes'), 422, 'بلغ المشروع الحد الأقصى لمساحة الأدلة.');
                $id = DB::table('evidence_files')->insertGetId([
                    'project_id' => $project->id, 'issue_id' => $issueId, 'step_result_id' => $stepResultId, 'retest_attempt_id' => $retestId,
                    'uploaded_by' => $actor->id, 'kind' => $kind, 'path' => $stored,
                    'original_name' => $this->displayName($file->getClientOriginalName(), $extension),
                    'mime' => $mime, 'size' => $size, 'sha256' => $hash, 'created_at' => now(),
                ]);
                $this->audit->audit($project, $actor, 'evidence.uploaded', ['evidence_id' => $id, 'issue_id' => $issueId, 'step_result_id' => $stepResultId, 'retest_attempt_id' => $retestId, 'kind' => $kind, 'mime' => $mime, 'size' => $size]);
                if ($issueForTimeline) {
                    DB::table('issue_activities')->insert([
                        'issue_id' => $issueForTimeline, 'actor_id' => $actor->id, 'event' => 'evidence_added',
                        'metadata' => json_encode(['evidence_id' => $id, 'kind' => $kind, 'retest_id' => $retestId], JSON_THROW_ON_ERROR), 'created_at' => now(),
                    ]);
                }

                return $id;
            });
        } catch (\Throwable $exception) {
            Storage::disk('evidence')->delete($stored);
            throw $exception;
        }
    }

    public function download(Project $project, User $actor, int $evidenceId, bool $inline): StreamedResponse
    {
        Gate::forUser($actor)->authorize('view', $project);
        $file = DB::table('evidence_files')->where('project_id', $project->id)->where('id', $evidenceId)->first();
        abort_unless($file, 404);
        abort_unless(str_starts_with($file->path, $project->id.'/') && Storage::disk('evidence')->exists($file->path), 404);
        // Attachment downloads are always audited; inline gallery previews once per user/file/hour so polling views do not flood the project log.
        if (! $inline || Cache::add("evidence-view:{$actor->id}:{$file->id}", true, now()->addHour())) {
            $this->audit->audit($project, $actor, 'evidence.downloaded', ['evidence_id' => $file->id, 'inline' => $inline]);
        }
        $inline = $inline && in_array($file->mime, config('evidence.inline'), true);
        $name = str_replace(['"', "\r", "\n", '/', '\\'], '', $file->original_name);
        $headers = [
            'Content-Type' => $file->mime,
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'Cross-Origin-Resource-Policy' => 'same-origin',
        ];

        return Storage::disk('evidence')->response($file->path, $name, $headers, $inline ? 'inline' : 'attachment');
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function present(int $projectId, ?int $issueId = null, ?int $stepResultId = null, ?int $retestId = null, ?int $runId = null): array
    {
        return DB::table('evidence_files')->join('users', 'users.id', '=', 'evidence_files.uploaded_by')
            ->where('evidence_files.project_id', $projectId)
            ->when($issueId, fn ($query) => $query->where('evidence_files.issue_id', $issueId))
            ->when($stepResultId, fn ($query) => $query->where('evidence_files.step_result_id', $stepResultId))
            ->when($retestId, fn ($query) => $query->where('evidence_files.retest_attempt_id', $retestId))
            ->when($runId, fn ($query) => $query->whereIn('evidence_files.step_result_id', DB::table('step_results')->where('test_run_id', $runId)->select('id')))
            ->orderBy('evidence_files.id')
            ->get(['evidence_files.id', 'evidence_files.issue_id', 'evidence_files.step_result_id', 'evidence_files.retest_attempt_id', 'evidence_files.kind', 'evidence_files.original_name', 'evidence_files.mime', 'evidence_files.size', 'evidence_files.sha256', 'evidence_files.created_at', 'evidence_files.uploaded_by', 'users.name as uploader'])
            ->map(fn ($file) => (array) $file)->all();
    }

    /**
     * @return array{0: string, 1: string, 2: string|null} mime, extension, re-encoded bytes (images only)
     */
    private function inspect(UploadedFile $file, string $kind): array
    {
        abort_unless($file->isValid(), 422, 'فشل رفع الملف.');
        $path = $file->getRealPath();
        $size = (int) $file->getSize();
        abort_if($size <= 0, 422, 'الملف فارغ.');
        $limit = config("evidence.limits.$kind");
        abort_unless(is_int($limit) && $size <= $limit, 422, 'يتجاوز الملف الحجم المسموح لهذا النوع.');
        // A file the OS refuses to open (for example quarantined by antivirus) is rejected, never stored.
        $handle = is_string($path) && is_readable($path) ? @fopen($path, 'rb') : false;
        abort_if($handle === false, 422, 'تعذّر فحص الملف المرفوع.');
        $head = (string) fread($handle, 4096);
        fclose($handle);
        $mime = @(new \finfo(FILEINFO_MIME_TYPE))->file($path);
        abort_unless(is_string($mime), 422, 'تعذّر فحص الملف المرفوع.');
        $extension = config("evidence.types.$kind.$mime");
        abort_unless(is_string($extension), 422, 'نوع الملف غير مسموح لهذا الدليل.');
        $this->assertMagic($head, $mime, $path);
        if (str_starts_with($mime, 'image/')) {
            return [$mime, $extension, $this->reencode((string) file_get_contents($path), $mime)];
        }

        return [$mime, $extension, null];
    }

    private function displayName(string $original, string $extension): string
    {
        $name = basename(str_replace('\\', '/', $original));
        $name = (string) preg_replace('/\.[^.]*$/', '', $name);
        $name = (string) preg_replace('/[^\p{Arabic}\p{N}A-Za-z_ -]+/u', '', $name);
        $name = trim(mb_substr($name, 0, 160));

        return ($name !== '' ? $name : 'evidence').'.'.$extension;
    }

    private function assertMagic(string $head, string $mime, string $path): void
    {
        $text = fn () => ! str_contains($head, "\0") && ! preg_match('/^\s*(<\?|<!doctype|<html|<script|<svg)/i', $head) && mb_check_encoding((string) file_get_contents($path, length: 1048576), 'UTF-8');
        $ok = match ($mime) {
            'image/png' => str_starts_with($head, "\x89PNG\r\n\x1a\n"),
            'image/jpeg' => str_starts_with($head, "\xFF\xD8\xFF"),
            'image/gif' => str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a'),
            'image/webp' => str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP',
            'video/webm' => str_starts_with($head, "\x1A\x45\xDF\xA3"),
            'video/mp4' => substr($head, 4, 4) === 'ftyp',
            'application/pdf' => str_starts_with($head, '%PDF-'),
            'text/plain', 'text/csv' => $text(),
            'application/json' => $text() && json_decode((string) file_get_contents($path)) !== null,
            default => false,
        };
        abort_unless($ok, 422, 'محتوى الملف لا يطابق نوعه المعلن.');
    }

    private function reencode(string $bytes, string $mime): string
    {
        abort_unless(function_exists('imagecreatefromstring'), 422, 'التحقق من الصور غير متاح في هذه البيئة.');
        $info = @getimagesizefromstring($bytes);
        abort_unless(is_array($info) && $info[0] > 0 && $info[1] > 0, 422, 'تعذّر قراءة أبعاد الصورة.');
        abort_if(config('evidence.max_image_pixels') < $info[0] * $info[1], 422, 'أبعاد الصورة كبيرة جدًا.');
        $image = @imagecreatefromstring($bytes);
        abort_unless($image, 422, 'تعذّر قراءة الصورة بعد التحقق.');
        ob_start();
        $written = match ($mime) {
            'image/jpeg' => imagejpeg($image, null, 90),
            'image/gif' => imagegif($image),
            'image/webp' => function_exists('imagewebp') ? imagewebp($image, null, 90) : false,
            default => imagepng($image),
        };
        $encoded = ob_get_clean();
        imagedestroy($image);
        abort_unless($written && is_string($encoded) && $encoded !== '', 422, 'رُفضت الصورة أثناء إعادة الترميز.');

        return $encoded;
    }
}
