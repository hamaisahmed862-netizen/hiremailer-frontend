import { useState, useEffect, useRef } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";
const STEP_LABELS = ["Connect", "Upload", "Compose", "Dispatch"];

function StepRail({ activeStep }) {
  return (
    <div className="step-rail">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className={`step-node ${i <= activeStep ? "step-node--active" : ""}`}>
          <span className="step-node__mark">{String(i + 1).padStart(2, "0")}</span>
          <span className="step-node__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function PostmarkStamp({ count, date }) {
  return (
    <div className="postmark" role="img" aria-label={`Dispatched ${count} emails on ${date}`}>
      <svg viewBox="0 0 160 160" className="postmark__svg">
        <circle cx="80" cy="80" r="74" className="postmark__ring-outer" />
        <circle cx="80" cy="80" r="64" className="postmark__ring-inner" />
        <text x="80" y="46" textAnchor="middle" className="postmark__arc-text-top">
          HIREMAILER · DISPATCHED
        </text>
        <text x="80" y="90" textAnchor="middle" className="postmark__count">{count}</text>
        <text x="80" y="108" textAnchor="middle" className="postmark__sub">EMAILS SENT</text>
        <text x="80" y="128" textAnchor="middle" className="postmark__date">{date}</text>
      </svg>
    </div>
  );
}

function App() {
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem("hiremailer_session") || "");
  const [connectedEmail, setConnectedEmail] = useState(() => localStorage.getItem("hiremailer_email") || "");
  const [companyName, setCompanyName] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [companyLoading, setCompanyLoading] = useState(true);

  const [csvFile, setCsvFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [subjectTemplate, setSubjectTemplate] = useState("Your application for {{role}}");
  const [bodyTemplate, setBodyTemplate] = useState(
    "Hi {{name}},\n\nThanks for applying for the {{role}} role. We'll be in touch soon!"
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const [batchStatus, setBatchStatus] = useState(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromRedirect = params.get("session_token");
    const emailFromRedirect = params.get("connected_email");
    const errorFromRedirect = params.get("connect_error");

    if (tokenFromRedirect && emailFromRedirect) {
      setSessionToken(tokenFromRedirect);
      setConnectedEmail(emailFromRedirect);
      localStorage.setItem("hiremailer_session", tokenFromRedirect);
      localStorage.setItem("hiremailer_email", emailFromRedirect);
      window.history.replaceState({}, "", "/");
    }

    if (errorFromRedirect) {
      setConnectError(errorFromRedirect);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setCompanyLoading(false);
      return;
    }
    const fetchCompany = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/company/me`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setCompanyName(data.company_name || "");
      } catch (err) {
        // Ignore — worst case, the name prompt shows again
      } finally {
        setCompanyLoading(false);
      }
    };
    fetchCompany();
  }, [sessionToken]);

  const authHeaders = () => ({ Authorization: `Bearer ${sessionToken}` });

  const handleConnectGmail = () => {
    window.location.href = `${BACKEND_URL}/auth/google`;
  };

  const handleDisconnect = () => {
    localStorage.removeItem("hiremailer_session");
    localStorage.removeItem("hiremailer_email");
    setSessionToken("");
    setConnectedEmail("");
    setCompanyName("");
    setUploadResult(null);
    setBatchStatus(null);
  };

  const handleSaveCompanyName = async () => {
    const name = companyNameInput.trim();
    if (!name) return;
    setSavingName(true);
    try {
      const res = await fetch(`${BACKEND_URL}/company/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ company_name: name }),
      });
      const data = await res.json();
      if (!data.error) {
        setCompanyName(data.company_name);
      }
    } catch (err) {
      // If this fails, the prompt just stays up — no data was lost
    } finally {
      setSavingName(false);
    }
  };

  const handleFileChange = (e) => {
    setCsvFile(e.target.files[0]);
    setUploadResult(null);
    setUploadError("");
    setBatchStatus(null);
  };

  const handleUpload = async () => {
    if (!csvFile) return;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", csvFile);

    try {
      const res = await fetch(`${BACKEND_URL}/applicants/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      if (res.status === 401) {
        setUploadError("Your session expired — please reconnect Gmail.");
        handleDisconnect();
        return;
      }

      const data = await res.json();
      if (data.error) {
        setUploadError(data.error);
      } else {
        setUploadResult(data);
      }
    } catch (err) {
      setUploadError("Could not reach the server. Is the backend running?");
    } finally {
      setUploading(false);
    }
  };

  const pollBatchStatus = (batchId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/send/batch/${batchId}/status`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!data.error) {
          setBatchStatus(data);
          if (data.summary.pending === 0 && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      } catch (err) {
        // Silently ignore a failed poll tick — will retry on next interval
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  };

  const handleSend = async () => {
    if (!uploadResult?.batch_id) return;
    setSending(true);
    setSendError("");
    setBatchStatus(null);

    try {
      const res = await fetch(`${BACKEND_URL}/send/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          batch_id: uploadResult.batch_id,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          delay_seconds: 3,
        }),
      });

      if (res.status === 401) {
        setSendError("Your session expired — please reconnect Gmail.");
        handleDisconnect();
        return;
      }

      const data = await res.json();
      if (data.error) {
        setSendError(data.error);
      } else {
        pollBatchStatus(uploadResult.batch_id);
      }
    } catch (err) {
      setSendError("Could not reach the server. Is the backend running?");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!uploadResult?.batch_id) return;
    try {
      await fetch(`${BACKEND_URL}/send/batch/${uploadResult.batch_id}/cancel`, {
        method: "POST",
        headers: authHeaders(),
      });
      // Status will reflect the cancellation on the next poll tick.
    } catch (err) {
      // If this fails, the next poll will still show accurate pending count
    }
  };

  const handleStartNewBatch = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setCsvFile(null);
    setUploadResult(null);
    setUploadError("");
    setBatchStatus(null);
    setSendError("");
    setSubjectTemplate("Your application for {{role}}");
    setBodyTemplate("Hi {{name}},\n\nThanks for applying for the {{role}} role. We'll be in touch soon!");
  };

  const renderPreview = (template) => {
    if (!uploadResult?.sample) return template;
    return template
      .replaceAll("{{name}}", uploadResult.sample.name || "")
      .replaceAll("{{role}}", uploadResult.sample.role || "");
  };

  const activeStep = batchStatus ? 3 : uploadResult?.batch_id ? 2 : connectedEmail ? 1 : 0;

  const todayLabel = new Date().toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__mark">✉</div>
        <div>
          <h1 className="masthead__title">HireMailer</h1>
          <p className="masthead__tagline">
            {companyName ? `${companyName} — ` : ""}A dispatch ledger for applicant mail — one message, every name.
          </p>
        </div>
        {connectedEmail && (
          <button className="btn btn--ghost masthead__disconnect" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </header>

      <StepRail activeStep={activeStep} />

      <main className="ledger">
        <section className="ticket">
          <div className="ticket__head">
            <span className="ticket__index">01</span>
            <h2 className="ticket__title">Connect your Gmail</h2>
          </div>
          <div className="ticket__body">
            {connectedEmail ? (
              <>
                <p className="status-line status-line--ok">
                  <span className="status-dot" /> Connected as <strong>{connectedEmail}</strong>
                </p>
                {!companyName && !companyLoading && (
                  <div className="name-prompt">
                    <label className="field-label" htmlFor="company-name-input">What's your company name?</label>
                    <div className="file-row">
                      <input
                        id="company-name-input"
                        type="text"
                        placeholder="e.g. Acme Corp"
                        value={companyNameInput}
                        onChange={(e) => setCompanyNameInput(e.target.value)}
                      />
                      <button
                        className="btn btn--secondary"
                        onClick={handleSaveCompanyName}
                        disabled={!companyNameInput.trim() || savingName}
                      >
                        {savingName ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="ticket__hint">
                  HireMailer sends from your own inbox — nothing routes through a shared server.
                </p>
                {connectError && <p className="status-line status-line--error">{connectError}</p>}
                <button className="btn btn--primary" onClick={handleConnectGmail}>
                  Connect Gmail
                </button>
              </>
            )}
          </div>
        </section>

        {connectedEmail && (
          <section className="ticket">
            <div className="ticket__head">
              <span className="ticket__index">02</span>
              <h2 className="ticket__title">Upload the applicant list</h2>
            </div>
            <div className="ticket__body">
              <p className="ticket__hint">CSV or Excel — columns required: <code>name</code>, <code>role</code>, <code>email</code></p>

              <div className="file-row">
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} id="file-input" className="file-input" />
                <label htmlFor="file-input" className="file-input__label">
                  {csvFile ? csvFile.name : "Choose file"}
                </label>
                <button className="btn btn--secondary" onClick={handleUpload} disabled={!csvFile || uploading}>
                  {uploading ? "Reading…" : "Upload"}
                </button>
              </div>

              {uploadError && <p className="status-line status-line--error">{uploadError}</p>}

              {uploadResult && (
                <>
                  <p className="status-line status-line--ok">
                    <span className="status-dot" /> {uploadResult.count} applicants on file
                  </p>
                  {uploadResult.warnings?.map((w, i) => (
                    <p key={i} className="status-line status-line--warn">⚠ {w}</p>
                  ))}
                </>
              )}
            </div>
          </section>
        )}

        {uploadResult?.batch_id && (
          <section className="ticket">
            <div className="ticket__head">
              <span className="ticket__index">03</span>
              <h2 className="ticket__title">Compose the message</h2>
            </div>
            <div className="ticket__body">
              <p className="ticket__hint">
                Write it once — <code>{"{{name}}"}</code> and <code>{"{{role}}"}</code> are swapped per applicant.
              </p>

              <label className="field-label" htmlFor="subject-input">Subject line</label>
              <input
                id="subject-input"
                type="text"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
              />

              <label className="field-label field-label--spaced" htmlFor="body-input">Message body</label>
              <textarea
                id="body-input"
                rows={6}
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
              />

              <button className="btn btn--send" onClick={handleSend} disabled={sending || !subjectTemplate || !bodyTemplate}>
                {sending ? "Queuing…" : `Dispatch to ${uploadResult.count} applicants`}
              </button>

              {sendError && <p className="status-line status-line--error">{sendError}</p>}

              {uploadResult.sample && (
                <div className="preview">
                  <p className="preview__label">
                    Preview — as {uploadResult.sample.name} ({uploadResult.sample.role}) will see it
                  </p>
                  <div className="preview__envelope">
                    <p className="preview__subject">{renderPreview(subjectTemplate)}</p>
                    <p className="preview__body">{renderPreview(bodyTemplate)}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {batchStatus && (
          <section className="ticket ticket--dispatch">
            <div className="ticket__head">
              <span className="ticket__index">04</span>
              <h2 className="ticket__title">Dispatch log</h2>
            </div>
            <div className="ticket__body ticket__body--split">
              <div className="dispatch-log">
                <div className="counters">
                  <div className="counter">
                    <span className="counter__value counter__value--sent">{batchStatus.summary.sent}</span>
                    <span className="counter__label">Sent</span>
                  </div>
                  <div className="counter">
                    <span className="counter__value counter__value--pending">{batchStatus.summary.pending}</span>
                    <span className="counter__label">Pending</span>
                  </div>
                  <div className="counter">
                    <span className="counter__value counter__value--failed">{batchStatus.summary.failed}</span>
                    <span className="counter__label">Failed</span>
                  </div>
                  {batchStatus.summary.cancelled > 0 && (
                    <div className="counter">
                      <span className="counter__value counter__value--cancelled">{batchStatus.summary.cancelled}</span>
                      <span className="counter__label">Cancelled</span>
                    </div>
                  )}
                </div>

                {batchStatus.summary.pending > 0 && (
                  <button className="btn btn--stop" onClick={handleCancel}>
                    Stop Sending
                  </button>
                )}

              <div className="manifest-scroll">
                <table className="manifest">
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchStatus.details.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <span className="manifest__name">{row.name}</span>
                          <span className="manifest__email">{row.email}</span>
                        </td>
                        <td>
                          <span className={`chip chip--${row.status}`}>{row.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>

              {batchStatus.summary.pending === 0 && (
                <div className="postmark-wrap">
                  <PostmarkStamp count={batchStatus.summary.sent} date={todayLabel} />
                  <button className="btn btn--secondary" onClick={handleStartNewBatch}>
                    Start New Batch
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
