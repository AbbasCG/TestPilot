<?php

namespace App\Http\Controllers;

use App\Services\MyWorkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MyWorkController extends Controller
{
    public function __invoke(Request $request, MyWorkService $service): JsonResponse
    {
        return response()->json(['data' => $service->for($request->user())])->header('Cache-Control', 'no-store');
    }
}
