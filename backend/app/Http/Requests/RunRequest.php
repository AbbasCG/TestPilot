<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RunRequest extends FormRequest
{
    public function authorize(): bool
    {
        Gate::authorize('view', $this->route('project'));
        Gate::authorize('designTests', $this->route('project'));

        return true;
    }

    public function rules(): array
    {
        $id = $this->route('project')->id;

        return [
            'title' => 'required|string|max:200', 'build_version' => 'required|string|max:120',
            'environment_id' => ['required', 'integer', Rule::exists('environments', 'id')->where('project_id', $id)->where('archived', false)],
            'suite_id' => ['nullable', 'integer', Rule::exists('test_suites', 'id')->where('project_id', $id)->where('archived', false)],
            'tester_a_id' => ['required', 'integer', Rule::exists('project_members', 'user_id')->where('project_id', $id)->whereIn('role', ['owner', 'manager', 'tester'])],
            'tester_b_id' => ['required', 'integer', 'different:tester_a_id', Rule::exists('project_members', 'user_id')->where('project_id', $id)->whereIn('role', ['owner', 'manager', 'tester'])],
            'scenarios' => 'required|array|min:1|max:20', 'scenarios.*' => 'array:id,version',
            'scenarios.*.id' => ['required', 'integer', 'distinct', Rule::exists('test_cases', 'id')->where('project_id', $id)->where('status', 'ready')],
            'scenarios.*.version' => 'required|integer|min:1',
        ];
    }
}
