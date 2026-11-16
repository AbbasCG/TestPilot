import { useState } from "react";
import { Copy, KeyRound, Link2 } from "lucide-react";

/**
 * Displays a secret (temporary password or invitation link) exactly once.
 * It lives only in component state: nothing is cached, stored or re-fetchable.
 */
export function OneTimeSecret({ kind, value, onDone }: { kind: "password" | "link"; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="one-time-secret" role="alert" aria-labelledby="secret-title">
      <h3 id="secret-title">
        {kind === "password" ? <KeyRound size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
        {kind === "password" ? "كلمة المرور المؤقتة" : "رابط الدعوة"}
      </h3>
      <p>
        {kind === "password"
          ? "تظهر هذه الكلمة الآن فقط ولن تُعرض مرة أخرى. انقلها إلى صاحب الحساب بقناة آمنة منفصلة، وسيُطلب منه تغييرها عند أول دخول."
          : "يظهر هذا الرابط الآن فقط لأن البريد غير مُعدّ. أرسله إلى الشخص المدعو بقناة آمنة منفصلة. الرابط يُستخدم مرة واحدة وله مدة صلاحية."}
      </p>
      <div className="secret-value">
        <code dir="ltr" aria-label={kind === "password" ? "كلمة المرور المؤقتة" : "رابط الدعوة"}>
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => undefined);
            setCopied(true);
          }}
        >
          <Copy size={16} /> {copied ? "نُسخ" : "نسخ"}
        </button>
      </div>
      <button type="button" className="primary" onClick={onDone}>
        نقلتها بأمان — إخفاء
      </button>
    </section>
  );
}
