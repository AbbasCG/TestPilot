<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Issue extends Model
{
    protected $fillable = [
        'title', 'description', 'reproduction_steps', 'expected_result', 'actual_result',
        'severity', 'priority', 'build_version',
    ];

    protected function casts(): array
    {
        return ['environment_snapshot' => 'array', 'closed_at' => 'datetime'];
    }
}
