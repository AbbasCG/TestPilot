<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TestCase extends Model
{
    protected $fillable = ['suite_id', 'environment_id', 'title', 'priority', 'status', 'is_template'];

    protected function casts(): array
    {
        return ['is_template' => 'boolean'];
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(ScenarioRevision::class);
    }

    public function currentRevision(): ScenarioRevision
    {
        return $this->revisions()->where('version', $this->version)->firstOrFail();
    }
}
