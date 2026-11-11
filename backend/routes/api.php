<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProjectController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/user', fn (Request $request) => response()->json(['data' => $request->user()]));
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/dashboard', [ProjectController::class, 'dashboard']);
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::patch('/projects/{project}', [ProjectController::class, 'update']);
    Route::post('/projects/{project}/environments', [ProjectController::class, 'environment']);
    Route::put('/projects/{project}/members', [ProjectController::class, 'member']);
    Route::get('/projects/{project}/activity', [ProjectController::class, 'activity']);
});
