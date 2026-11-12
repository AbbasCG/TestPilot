<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScenarioRevision extends Model
{
    public $timestamps = false;

    protected $fillable = ['version', 'content', 'author_id'];

    protected function casts(): array
    {
        return ['content' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Scenario revisions are immutable.'));
        static::deleting(fn () => throw new \LogicException('Scenario revisions are immutable.'));
    }
}
