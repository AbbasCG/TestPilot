<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ScenarioResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'uid' => $this->uid, 'project_id' => $this->project_id,
            'suite_id' => $this->suite_id, 'environment_id' => $this->environment_id,
            'title' => $this->title, 'status' => $this->status, 'priority' => $this->priority,
            'version' => $this->version, 'is_template' => $this->is_template,
            'content' => $this->currentRevision()->content, 'updated_at' => $this->updated_at,
        ];
    }
}
