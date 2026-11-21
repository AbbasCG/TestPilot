<?php

namespace App\Services;

use App\Models\Project;
use App\Models\TestCase;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ScenarioService
{
    public function __construct(private ProjectService $audit) {}

    public function save(Project $project, User $actor, array $data, ?TestCase $scenario = null): TestCase
    {
        return DB::transaction(function () use ($project, $actor, $data, $scenario) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            if ($scenario) {
                $scenario = TestCase::whereKey($scenario->id)->lockForUpdate()->firstOrFail();
                abort_if($scenario->version !== (int) $data['version'], 409, 'تم تعديل السيناريو. حمّل أحدث نسخة.');
                $scenario->version++;
            } else {
                $scenario = new TestCase;
                $scenario->project_id = $project->id;
                $scenario->uid = (string) Str::uuid();
                $scenario->version = 1;
            }
            $this->validateDependencies($project, $scenario, $data['dependencies']);
            $scenario->fill($data)->save();
            unset($data['version']);
            $scenario->revisions()->create(['version' => $scenario->version, 'author_id' => $actor->id, 'content' => $data]);
            $this->audit->audit($project, $actor, 'scenario.saved', ['scenario_id' => $scenario->id, 'version' => $scenario->version]);

            return $scenario;
        });
    }

    /**
     * Change the status or suite of several scenarios at once, all or nothing. Every scenario is checked against
     * the version the client saw; each one that actually changes gets a new revision, like a single edit.
     *
     * @param  list<array{id: int, version: int}>  $items
     * @param  array{status?: string, suite_id?: int}  $changes
     * @return array{updated: int, unchanged: int}
     */
    public function bulkUpdate(Project $project, User $actor, array $items, array $changes): array
    {
        return DB::transaction(function () use ($project, $actor, $items, $changes) {
            $locked = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->status === 'archived', 422, 'أعد تفعيل المشروع قبل تعديل السيناريوهات.');
            $versions = collect($items)->mapWithKeys(fn ($item) => [(int) $item['id'] => (int) $item['version']]);
            $scenarios = TestCase::where('project_id', $project->id)->whereIn('id', $versions->keys())->orderBy('id')->lockForUpdate()->get();
            abort_if($scenarios->count() !== $versions->count(), 404, 'بعض السيناريوهات المحددة غير موجودة في هذا المشروع.');
            $stale = $scenarios->filter(fn (TestCase $s) => $s->version !== $versions[$s->id])->count();
            abort_if($stale > 0, 409, "تغيّر $stale من السيناريوهات المحددة منذ فتح القائمة. حدّث القائمة ثم أعد المحاولة.");

            $updated = 0;
            foreach ($scenarios as $scenario) {
                $content = $scenario->currentRevision()->content;
                $delta = array_filter($changes, fn ($value, $field) => $scenario->{$field} !== $value, ARRAY_FILTER_USE_BOTH);
                if ($delta === []) {
                    continue;
                }
                $scenario->fill($delta);
                $scenario->version++;
                $scenario->save();
                $scenario->revisions()->create(['version' => $scenario->version, 'author_id' => $actor->id, 'content' => [...$content, ...$delta]]);
                $this->audit->audit($project, $actor, 'scenario.saved', ['scenario_id' => $scenario->id, 'version' => $scenario->version, 'bulk' => true]);
                $updated++;
            }

            return ['updated' => $updated, 'unchanged' => $scenarios->count() - $updated];
        });
    }

    private function validateDependencies(Project $project, TestCase $scenario, array $dependencies): void
    {
        $visited = [];
        $visit = function (int $id) use (&$visit, &$visited, $project, $scenario): void {
            if ($id === $scenario->id) {
                throw ValidationException::withMessages(['dependencies' => 'لا يمكن إنشاء اعتماد دائري بين السيناريوهات.']);
            }
            if (isset($visited[$id])) {
                return;
            }
            $visited[$id] = true;
            $dependency = TestCase::where('project_id', $project->id)->findOrFail($id);
            foreach ($dependency->currentRevision()->content['dependencies'] ?? [] as $child) {
                $visit((int) $child);
            }
        };
        foreach ($dependencies as $id) {
            $visit((int) $id);
        }
    }
}
