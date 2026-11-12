<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ScenarioRequest extends FormRequest
{
    public const STEP_TYPES = ['navigate', 'click', 'input', 'select', 'upload', 'verify', 'compare', 'switch_user', 'wait_for_tester', 'shared_checkpoint', 'capture_evidence', 'custom_action'];

    public function authorize(): bool
    {
        Gate::authorize('view', $this->route('project'));
        Gate::authorize('designTests', $this->route('project'));

        return true;
    }

    public function rules(): array
    {
        $project = $this->route('project');
        $rules = [
            'suite_id' => ['required', 'integer', Rule::exists('test_suites', 'id')->where('project_id', $project->id)->where('archived', false)],
            'environment_id' => ['nullable', 'integer', Rule::exists('environments', 'id')->where('project_id', $project->id)->where('archived', false)],
            'title' => ['required', 'string', 'max:200'],
            'priority' => ['required', Rule::in(['low', 'medium', 'high', 'critical'])],
            'status' => ['required', Rule::in(['draft', 'ready', 'archived'])],
            'test_type' => ['required', Rule::in(['functional', 'regression', 'smoke', 'security', 'integration', 'usability', 'performance', 'other'])],
            'is_template' => ['required', 'boolean'],
            'version' => [$this->isMethod('PUT') ? 'required' : 'sometimes', 'integer', 'min:1'],
            'dependencies' => ['present', 'array', 'max:50'],
            'dependencies.*' => ['integer', 'distinct', Rule::exists('test_cases', 'id')->where('project_id', $project->id)],
            'steps' => ['required', 'array', 'min:1', 'max:100'],
            'steps.*' => ['array:id,type,title,assigned_role,url,target,value,expected_result,instructions,checkpoint,evidence_required,depends_on'],
            'steps.*.id' => ['required', 'uuid', 'distinct'],
            'steps.*.type' => ['required', Rule::in(self::STEP_TYPES)],
            'steps.*.title' => ['required', 'string', 'max:200'],
            'steps.*.assigned_role' => ['required', Rule::in(['A', 'B', 'both'])],
            'steps.*.url' => ['nullable', 'url:http,https', 'max:2048'],
            'steps.*.evidence_required' => ['required', 'boolean'],
            'steps.*.depends_on' => ['present', 'array', 'max:100'],
            // Uniqueness is checked per step in after(): a wildcard "distinct" would wrongly forbid two steps sharing a prerequisite.
            'steps.*.depends_on.*' => ['uuid'],
            'steps.*.expected_result' => ['required', 'string', 'max:5000'],
        ];
        foreach (['description', 'objective', 'prerequisites', 'required_account', 'required_role', 'test_data', 'expected_results', 'acceptance_criteria'] as $field) {
            $rules[$field] = [in_array($field, ['objective', 'acceptance_criteria']) ? 'required' : 'nullable', 'string', 'max:10000'];
        }
        foreach (['target', 'value', 'instructions', 'checkpoint'] as $field) {
            $rules["steps.*.$field"] = ['nullable', 'string', 'max:5000'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return ['required' => 'الحقل :attribute مطلوب.', 'exists' => 'اختر سجلًا نشطًا من المشروع نفسه.', 'steps.*.expected_result.required' => 'اكتب نتيجة متوقعة لكل خطوة قبل الحفظ.'];
    }

    public function after(): array
    {
        return [function ($validator) {
            $seen = [];
            $steps = $this->input('steps', []);
            if (! is_array($steps)) {
                return;
            }
            foreach ($steps as $index => $step) {
                if (! is_array($step)) {
                    continue;
                }
                $dependencies = is_array($step['depends_on'] ?? null) ? $step['depends_on'] : [];
                if (count($dependencies) !== count(array_unique(array_map('strval', $dependencies)))) {
                    $validator->errors()->add("steps.$index.depends_on", 'لا تكرر الاعتماد نفسه داخل الخطوة.');
                }
                foreach ($dependencies as $dependency) {
                    if (! in_array($dependency, $seen, true)) {
                        $validator->errors()->add("steps.$index.depends_on", 'يجب أن تعتمد الخطوة على خطوة سابقة موجودة.');
                    }
                }
                if (($step['type'] ?? '') === 'shared_checkpoint' && (($step['assigned_role'] ?? '') !== 'both' || empty($step['checkpoint']))) {
                    $validator->errors()->add("steps.$index.checkpoint", 'نقطة التحقق المشتركة تحتاج معيار تحقق وتأكيد الطرفين.');
                }
                if (($step['type'] ?? '') === 'wait_for_tester' && empty($step['depends_on'])) {
                    $validator->errors()->add("steps.$index.depends_on", 'حدّد الخطوة التي تنتظر اكتمالها.');
                }
                $seen[] = $step['id'] ?? null;
            }
        }];
    }
}
