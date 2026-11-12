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
