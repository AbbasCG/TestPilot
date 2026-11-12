<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TestRun extends Model
{
    protected $fillable = ['title', 'build_version'];

    protected function casts(): array
    {
        return ['environment_snapshot' => 'array', 'completed_at' => 'datetime'];
    }
}
