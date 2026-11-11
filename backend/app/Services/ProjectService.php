<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ProjectService
{
    public function audit(Project $project, User $actor, string $action, array $metadata = []): void
    {
        DB::table('activity_logs')->insert([
            'project_id' => $project->id, 'actor_id' => $actor->id,
            'action' => $action, 'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR), 'created_at' => now(),
        ]);
    }

    public function create(User $actor, array $data): Project
    {
        return DB::transaction(function () use ($actor, $data) {
            $project = new Project($data);
            $project->owner_id = $actor->id;
            $project->save();
            $project->members()->attach($actor, ['role' => 'owner']);
            $this->audit($project, $actor, 'project.created');

            return $project;
        });
    }

    public function update(Project $project, User $actor, array $data): Project
    {
        return DB::transaction(function () use ($project, $actor, $data) {
            $locked = Project::query()->lockForUpdate()->findOrFail($project->id);
            abort_if($locked->version !== (int) $data['version'], 409, 'تم تعديل المشروع. حدّث الصفحة قبل الحفظ.');
            $locked->fill($data);
            $locked->version++;
            $locked->save();
            $this->audit($locked, $actor, 'project.updated');

            return $locked;
        });
    }
}
