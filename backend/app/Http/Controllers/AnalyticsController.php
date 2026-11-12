<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\AnalyticsService;
use App\Services\ProjectService;
use App\Services\ReportExporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class AnalyticsController extends Controller
{
    public function __construct(private AnalyticsService $analytics, private ReportExporter $exporter, private ProjectService $audit) {}

    /**
     * @return array{days: int, build: string|null}
     */
    private function filters(Request $request): array
    {
        $data = $request->validate(['days' => ['nullable', 'integer', Rule::in([7, 30, 90])], 'build' => 'nullable|string|max:120']);

        return ['days' => (int) ($data['days'] ?? 30), 'build' => $data['build'] ?? null];
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);
        $filters = $this->filters($request);

        return response()->json(['data' => $this->analytics->project($project, $filters['days'], $filters['build'])]);
    }

    public function comparison(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->comparison($request->user())]);
    }

    public function export(Request $request, Project $project): Response
    {
        Gate::authorize('view', $project);
        $filters = $this->filters($request);
        $data = $request->validate(['format' => ['required', Rule::in(['csv', 'json', 'md'])], 'dataset' => ['nullable', Rule::in(['summary', 'runs', 'issues', 'testers'])]]);
        $report = $this->analytics->project($project, $filters['days'], $filters['build']);
        $dataset = $data['dataset'] ?? 'summary';
        $slug = 'testpilot-'.$project->id.'-'.(Str::slug($project->name) ?: 'project').'-'.now()->format('Ymd-His');
        $this->audit->audit($project, $request->user(), 'report.exported', ['format' => $data['format'], 'dataset' => $data['format'] === 'csv' ? $dataset : 'full']);
        [$body, $type, $name] = match ($data['format']) {
            'csv' => [$this->exporter->csv($this->exporter->dataset($report, $dataset, $project->id)), 'text/csv; charset=UTF-8', "$slug-$dataset.csv"],
            'json' => [json_encode([...$report, 'issue_list' => $this->exporter->issues($project->id)], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), 'application/json; charset=UTF-8', "$slug.json"],
            'md' => [$this->exporter->markdown($report, $project->id), 'text/markdown; charset=UTF-8', "$slug.md"],
        };

        return response($body, 200, [
            'Content-Type' => $type,
            'Content-Disposition' => 'attachment; filename="'.$name.'"',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
