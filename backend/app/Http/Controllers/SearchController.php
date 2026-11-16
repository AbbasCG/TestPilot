<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Quick search inside one project (scenarios, issues, sessions). Any member,
 * including viewers, may search what they may already read; everything is
 * scoped to the route project.
 */
class SearchController extends Controller
{
    public function __invoke(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);
        $q = trim($request->validate(['q' => ['required', 'string', 'max:120']])['q']);
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower($q)).'%';
        $number = preg_match('/^(?:#|tc-)?(\d{1,9})$/i', $q, $m) ? (int) $m[1] : null;

        $scenarios = DB::table('test_cases')->join('test_suites', 'test_suites.id', '=', 'test_cases.suite_id')
            ->where('test_cases.project_id', $project->id)
            ->where(fn ($w) => $w->whereRaw('lower(test_cases.title) like ?', [$like])->when($number, fn ($x) => $x->orWhere('test_cases.id', $number)))
            ->orderByRaw('case when lower(test_cases.title) = ? then 0 else 1 end', [mb_strtolower($q)])->orderByDesc('test_cases.id')->limit(8)
            ->get(['test_cases.id', 'test_cases.title', 'test_cases.status', 'test_suites.name as suite']);
        $issues = DB::table('issues')->where('project_id', $project->id)
            ->where(fn ($w) => $w->whereRaw('lower(title) like ?', [$like])->when($number, fn ($x) => $x->orWhere('number', $number)))
            ->orderByDesc('id')->limit(8)->get(['id', 'number', 'title', 'status', 'severity']);
        $runs = DB::table('test_runs')->where('project_id', $project->id)->whereRaw('lower(title) like ?', [$like])
            ->orderByDesc('id')->limit(5)->get(['id', 'title', 'status', 'build_version']);

        return response()->json(['data' => [
            'query' => $q,
            'scenarios' => $scenarios->map(fn ($s) => ['id' => $s->id, 'code' => 'TC-'.$s->id, 'title' => $s->title, 'status' => $s->status, 'suite' => $s->suite]),
            'issues' => $issues->map(fn ($i) => ['id' => $i->id, 'code' => '#'.$i->number, 'title' => $i->title, 'status' => $i->status, 'severity' => $i->severity]),
            'runs' => $runs->map(fn ($r) => ['id' => $r->id, 'title' => $r->title, 'status' => $r->status, 'build_version' => $r->build_version]),
        ]]);
    }
}
