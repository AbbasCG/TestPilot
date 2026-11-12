<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class ProjectPolicy
{
    public function view(User $user, Project $project): Response
    {
        return $project->members()->where('users.id', $user->id)->exists()
            ? Response::allow() : Response::denyAsNotFound();
    }

    public function update(User $user, Project $project): bool
    {
        return $project->owner_id === $user->id || $project->members()
            ->where('users.id', $user->id)->wherePivot('role', 'manager')->exists();
    }

    public function manageMembers(User $user, Project $project): bool
    {
        return $project->owner_id === $user->id;
    }

    public function designTests(User $user, Project $project): bool
    {
        return $project->members()->where('users.id', $user->id)->wherePivotIn('role', ['owner', 'manager', 'tester'])->exists();
    }
}
