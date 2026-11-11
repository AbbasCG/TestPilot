<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'description' => $this->description,
            'status' => $this->status, 'version' => $this->version, 'owner_id' => $this->owner_id,
            'role' => $this->members()->where('users.id', $request->user()->id)->first()?->pivot->role,
            'members_count' => $this->whenCounted('members'),
            'environments' => $this->whenLoaded('environments'),
            'members' => $this->whenLoaded('members', fn () => $this->members->map(fn ($member) => [
                'id' => $member->id, 'name' => $member->name, 'email' => $member->email, 'role' => $member->pivot->role,
            ])),
            'created_at' => $this->created_at, 'updated_at' => $this->updated_at,
        ];
    }
}
