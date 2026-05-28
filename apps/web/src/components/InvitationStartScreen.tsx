import { AlertCircle, ArrowRight, ClipboardCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { loadInvitationPreview, startInvitationInterview } from "../lib/invitationApi";
import type { InvitationPreview, InvitationStartResult } from "../types/invitation";

type InvitationStartScreenProps = {
  token: string;
  onStarted: (result: InvitationStartResult) => void;
};

export function InvitationStartScreen({ token, onStarted }: InvitationStartScreenProps) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadInvitationPreview(token)
      .then((loadedPreview) => {
        if (active) {
          setPreview(loadedPreview);
        }
      })
      .catch(() => {
        if (active) {
          setError("Ссылка приглашения недоступна или больше не активна.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !fullName.trim()) {
      setError("Укажите корпоративную почту и ФИО.");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const result = await startInvitationInterview(token, {
        email,
        fullName
      });
      onStarted(result);
    } catch {
      setError("Не удалось открыть анкету по этой ссылке. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="invitation-screen">
      <section className="invitation-panel">
        <div className="invitation-heading">
          <ClipboardCheck size={28} />
          <div>
            <span className="section-kicker">Профилирование должности</span>
            <h1>Начало заполнения анкеты</h1>
          </div>
        </div>

        {loading ? <p className="muted-text">Проверяем ссылку приглашения...</p> : null}

        {preview ? (
          <div className="invitation-position">
            <span>Должность из справочника</span>
            <strong>{preview.position.title}</strong>
            <small>{preview.position.orgUnit.fullPath}</small>
          </div>
        ) : null}

        {error ? (
          <div className="validation-callout invitation-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {preview ? (
          <form className="invitation-form" onSubmit={handleSubmit}>
            <label>
              <span>Корпоративная почта</span>
              <input
                type="email"
                value={email}
                placeholder="name@example.ru"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>ФИО</span>
              <input
                type="text"
                value={fullName}
                placeholder="Иванов Иван Иванович"
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <button type="submit" className="primary-button" disabled={starting}>
              {starting ? "Открываем..." : "Открыть анкету"}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
