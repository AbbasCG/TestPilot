<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Serialises a project analytics report. CSV cells are protected against
 * spreadsheet formula injection and written with a UTF-8 BOM so Arabic text
 * opens correctly in Excel.
 */
class ReportExporter
{
    private const STATUS = ['active' => 'قيد التنفيذ', 'paused' => 'متوقفة', 'completed' => 'منتهية', 'passed' => 'ناجحة', 'failed' => 'فاشلة', 'inconclusive' => 'غير حاسمة', 'blocked' => 'متعذرة', 'pending' => 'معلّقة'];

    private const READINESS = ['ready' => 'جاهز للإصدار', 'at_risk' => 'جاهزية مشروطة', 'not_ready' => 'غير جاهز'];

    /**
     * @return list<array<string, mixed>>
     */
    public function issues(int $projectId): array
    {
        return DB::table('issues')->leftJoin('users as a', 'a.id', '=', 'issues.assignee_id')->join('users as r', 'r.id', '=', 'issues.reporter_id')
            ->where('issues.project_id', $projectId)->orderBy('issues.number')
            ->get(['issues.number', 'issues.title', 'issues.status', 'issues.severity', 'issues.priority', 'r.name as reporter', 'a.name as assignee', 'issues.build_version', 'issues.test_run_id', 'issues.created_at', 'issues.closed_at'])
            ->map(fn ($row) => (array) $row)->all();
    }

    private function cell(mixed $value): string
    {
        $text = is_bool($value) ? ($value ? 'yes' : 'no') : (string) ($value ?? '');
        if ($text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) && ! is_numeric($text)) {
            $text = "'".$text;
        }

        return '"'.str_replace('"', '""', $text).'"';
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function csv(array $rows): string
    {
        if ($rows === []) {
            return "\u{FEFF}";
        }
        $lines = [implode(',', array_map(fn ($h) => $this->cell($h), array_keys($rows[0])))];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(fn ($v) => $this->cell(is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v), array_values($row)));
        }

        return "\u{FEFF}".implode("\r\n", $lines)."\r\n";
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<array<string, mixed>>
     */
    public function dataset(array $report, string $name, int $projectId): array
    {
        return match ($name) {
            'runs' => array_map(fn ($r) => ['run_id' => $r['id'], 'title' => $r['title'], 'build' => $r['build_version'], 'environment' => $r['environment'], 'status' => $r['status'], 'outcome' => $r['outcome'], 'steps' => $r['total'], 'passed' => $r['passed'], 'failed' => $r['failed'], 'blocked' => $r['blocked'], 'pending' => $r['pending'], 'pass_rate' => $r['pass_rate'], 'issues' => $r['issues'], 'created_at' => $r['created_at'], 'completed_at' => $r['completed_at']], $report['history']->all()),
            'issues' => $this->issues($projectId),
            'testers' => $report['testers']->all(),
            default => $this->summaryRows($report),
        };
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<array{metric: string, value: mixed}>
     */
    private function summaryRows(array $report): array
    {
        $rows = [
            ['metric' => 'project', 'value' => $report['project']['name']],
            ['metric' => 'generated_at', 'value' => $report['generated_at']],
            ['metric' => 'pass_rate', 'value' => $report['results']['pass_rate']],
            ['metric' => 'steps_executed', 'value' => $report['results']['executed']],
            ['metric' => 'steps_passed', 'value' => $report['results']['passed']],
            ['metric' => 'steps_failed', 'value' => $report['results']['failed']],
            ['metric' => 'steps_blocked', 'value' => $report['results']['blocked']],
            ['metric' => 'steps_pending', 'value' => $report['results']['pending']],
            ['metric' => 'runs_total', 'value' => $report['runs']['total']],
            ['metric' => 'issues_open', 'value' => $report['issues']['open']],
            ['metric' => 'issues_critical_open', 'value' => $report['issues']['critical_open']],
            ['metric' => 'retests_passed', 'value' => $report['retests']['passed']],
            ['metric' => 'retests_failed', 'value' => $report['retests']['failed']],
            ['metric' => 'retests_pending', 'value' => $report['retests']['pending']],
        ];
        if ($report['readiness']) {
            $rows[] = ['metric' => 'readiness_build', 'value' => $report['readiness']['build']];
            $rows[] = ['metric' => 'readiness_status', 'value' => $report['readiness']['status']];
        }

        return $rows;
    }

    private function md(mixed $value): string
    {
        return str_replace(['|', "\r", "\n"], ['\\|', ' ', ' '], (string) ($value ?? '—'));
    }

    /**
     * @param  array<string, mixed>  $report
     */
    public function markdown(array $report, int $projectId): string
    {
        $r = $report['results'];
        $out = ["# تقرير جودة: {$this->md($report['project']['name'])}", '', 'أُنشئ في: '.$report['generated_at'].' — من بيانات TestPilot الفعلية.', '', '## الملخص', '',
            '| المؤشر | القيمة |', '|---|---|',
            '| نسبة النجاح | '.($r['pass_rate'] === null ? '—' : $r['pass_rate'].'%').' |',
            "| خطوات منفذة | {$r['executed']} |", "| ناجحة | {$r['passed']} |", "| فاشلة | {$r['failed']} |", "| متعذرة | {$r['blocked']} |", "| غير منفذة | {$r['pending']} |",
            "| جلسات الاختبار | {$report['runs']['total']} |", "| مشكلات مفتوحة | {$report['issues']['open']} |", "| مشكلات حرجة مفتوحة | {$report['issues']['critical_open']} |",
            "| إعادة اختبار ناجحة / فاشلة / معلّقة | {$report['retests']['passed']} / {$report['retests']['failed']} / {$report['retests']['pending']} |", ''];
        if ($report['readiness']) {
            $readiness = $report['readiness'];
            $out = [...$out, "## جاهزية الإصدار `{$this->md($readiness['build'])}`: ".self::READINESS[$readiness['status']], '', '| الشرط | النتيجة | التفاصيل |', '|---|---|---|'];
            foreach ($readiness['checks'] as $check) {
                $out[] = '| '.$this->md($check['label']).' | '.($check['passed'] ? '✔ متحقق' : '✘ غير متحقق').' | '.$this->md($check['detail']).' |';
            }
            $out[] = '';
        }
        $out = [...$out, '## سجل التنفيذ', '', '| الجلسة | الإصدار | الحالة | التقييم | ناجحة | فاشلة | متعذرة | نسبة النجاح |', '|---|---|---|---|---|---|---|---|'];
        foreach ($report['history'] as $run) {
            $out[] = '| '.$this->md($run['title']).' | '.$this->md($run['build_version']).' | '.(self::STATUS[$run['status']] ?? $run['status']).' | '.($run['outcome'] ? self::STATUS[$run['outcome']] : '—')." | {$run['passed']} | {$run['failed']} | {$run['blocked']} | ".($run['pass_rate'] === null ? '—' : $run['pass_rate'].'%').' |';
        }
        $out = [...$out, '', '## إنتاجية المختبرين', '', '| العضو | جلسات | خطوات منفذة | ناجحة | فاشلة | مشكلات مبلغ عنها | إعادة اختبار |', '|---|---|---|---|---|---|---|'];
        foreach ($report['testers'] as $t) {
            $out[] = '| '.$this->md($t['name'])." | {$t['runs']} | {$t['steps_executed']} | {$t['passed']} | {$t['failed']} | {$t['issues_reported']} | {$t['retests_executed']} |";
        }
        $out = [...$out, '', '## المشكلات', '', '| # | العنوان | الحالة | الخطورة | المكلَّف |', '|---|---|---|---|---|'];
        foreach ($this->issues($projectId) as $issue) {
            $out[] = "| {$issue['number']} | ".$this->md($issue['title'])." | {$issue['status']} | {$issue['severity']} | ".$this->md($issue['assignee']).' |';
        }

        return implode("\n", $out)."\n";
    }
}
