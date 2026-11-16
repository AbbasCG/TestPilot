<?php

namespace App\Http\Requests;

use App\Services\Scenarios\ScenarioRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class ScenarioRequest extends FormRequest
{
    public function authorize(): bool
    {
        Gate::authorize('view', $this->route('project'));
        Gate::authorize('designTests', $this->route('project'));

        return true;
    }

    public function rules(): array
    {
        return ScenarioRules::rules($this->route('project')->id, $this->isMethod('PUT'));
    }

    public function messages(): array
    {
        return ['required' => 'الحقل :attribute مطلوب.', 'exists' => 'اختر سجلًا نشطًا من المشروع نفسه.', 'steps.*.expected_result.required' => 'اكتب نتيجة متوقعة لكل خطوة قبل الحفظ.'];
    }

    public function after(): array
    {
        return [function ($validator) {
            foreach (ScenarioRules::graphErrors($this->input('steps', [])) as $key => $message) {
                $validator->errors()->add($key, $message);
            }
        }];
    }
}
