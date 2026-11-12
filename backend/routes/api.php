<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ScenarioController;
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
    Route::put('/projects/{project}/environments/{environment}', [ProjectController::class, 'updateEnvironment']);
    Route::delete('/projects/{project}/members/{member}', [ProjectController::class, 'removeMember']);
    Route::get('/projects/{project}/activity', [ProjectController::class, 'activity']);
    Route::get('/projects/{project}/suites', [ScenarioController::class, 'suites']);
    Route::post('/projects/{project}/suites', [ScenarioController::class, 'saveSuite']);
    Route::put('/projects/{project}/suites/{suite}', [ScenarioController::class, 'saveSuite']);
    Route::get('/projects/{project}/scenarios', [ScenarioController::class, 'index']);
    Route::post('/projects/{project}/scenarios', [ScenarioController::class, 'store']);
    Route::get('/projects/{project}/scenarios/{scenario}', [ScenarioController::class, 'show']);
    Route::put('/projects/{project}/scenarios/{scenario}', [ScenarioController::class, 'update']);
    Route::get('/projects/{project}/scenarios/{scenario}/revisions', [ScenarioController::class, 'revisions']);
    Route::get('/projects/{project}/scenario-templates', [ScenarioController::class, 'templates']);
    Route::get('/projects/{project}/scenario-options', [ScenarioController::class, 'options']);
});
