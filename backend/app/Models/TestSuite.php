<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TestSuite extends Model
{
    protected $fillable = ['name', 'description', 'position', 'archived'];

    protected function casts(): array
    {
        return ['archived' => 'boolean'];
    }

    public function cases(): HasMany
    {
        return $this->hasMany(TestCase::class, 'suite_id');
    }
}
