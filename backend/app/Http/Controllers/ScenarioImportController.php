<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\Scenarios\ScenarioImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ScenarioImportController extends Controller
{
    public function __construct(private ScenarioImportService $imports) {}

    private function authorizeWriter(Project $project): void
    {
        Gate::authorize('view', $project);
        Gate::authorize('designTests', $project);
    }

    /** Everything the import dialog shows before a file exists: template, AI prompt and limits. */
    public function kit(Project $project): JsonResponse
    {
        $this->authorizeWriter($project);

        return response()->json(['data' => ['template' => $this->imports->template(), 'prompt' => $this->imports->prompt($project), 'limits' => $this->imports->limits()]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function document(Request $request): array
    {
        if (strlen($request->getContent()) > ScenarioImportService::MAX_BYTES * 2) {
            abort(413, 'حجم الملف يتجاوز الحد المسموح (1 ميغابايت).');
        }
        $data = $request->validate(['document' => ['required', 'array']]);
        $errors = $this->imports->documentErrors($data['document']);
        if ($errors !== []) {
            throw ValidationException::withMessages(['document' => $errors]);
        }

        return $data['document'];
    }

    /** Read-only: nothing is written. */
    public function preview(Request $request, Project $project): JsonResponse
    {
        $this->authorizeWriter($project);
        $document = $this->document($request);
        $options = $request->validate(['suite_id' => ['nullable', 'integer'], 'suite_name' => ['nullable', 'string', 'max:160']]);

        return response()->json(['data' => $this->imports->preview($project, $document, $options['suite_id'] ?? null, $options['suite_name'] ?? null)]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorizeWriter($project);
        $document = $this->document($request);
        $options = $request->validate([
            'suite_id' => ['nullable', 'integer'], 'suite_name' => ['nullable', 'string', 'max:160'],
            'idempotency_key' => ['required', 'uuid'], 'duplicates' => ['nullable', Rule::in(['skip', 'create'])],
            'expected' => ['nullable', 'array'], 'expected.new' => ['required_with:expected', 'integer', 'min:0'], 'expected.duplicate' => ['required_with:expected', 'integer', 'min:0'],
            'acknowledge_changes' => ['nullable', 'boolean'],
        ]);
        $options['duplicates'] ??= 'skip';
        $result = $this->imports->confirm($project, $request->user(), $document, $options);

        return response()->json(['data' => $result], $result['replayed'] ? 200 : 201);
    }
}
