"use client";

import { useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  baseName,
  downloadPdf,
  formatResultSummary,
  passwordProtect,
  type PasswordAlgorithm,
} from "@/lib/pdf";

export function PasswordTool() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [algorithm, setAlgorithm] = useState<PasswordAlgorithm>("AES-256");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(true);
  const [result, setResult] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="password-protect"
      onProcess={async (files) => {
        if (password !== confirm) {
          throw new Error("Passwords do not match");
        }
        setResult(null);
        const inputSize = files[0].size;
        const data = await passwordProtect(files[0], password, {
          ownerPassword: ownerPassword.trim() || password,
          algorithm,
          allowPrinting,
          allowCopying,
          allowModifying,
        });
        downloadPdf(data, `${baseName(files[0].name)}_protected.pdf`);
        setResult(
          formatResultSummary({ inputSize, outputSize: data.length }) +
            ` · encrypted with ${algorithm}`
        );
      }}
      processLabel="Protect PDF"
      disabled={!password || password !== confirm}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Encrypts your PDF with a password. Recipients must enter the password to open the file.
          Processing happens in your browser — the password is not sent to our servers.
        </p>

        <label className="block text-sm">
          <span className="font-medium">Open password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password to open the PDF"
            autoComplete="new-password"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Confirm password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
          />
        </label>

        {password && confirm && password !== confirm && (
          <p className="text-sm text-red-600">Passwords do not match</p>
        )}

        <label className="block text-sm">
          <span className="font-medium">Owner password</span>
          <span className="ml-1 text-muted">(optional — defaults to open password)</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            placeholder="Optional owner / permissions password"
            autoComplete="new-password"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Encryption</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as PasswordAlgorithm)}
          >
            <option value="AES-256">AES-256 (recommended)</option>
            <option value="RC4">RC4 128-bit (legacy readers)</option>
          </select>
        </label>

        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Permissions after opening</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowPrinting}
              onChange={(e) => setAllowPrinting(e.target.checked)}
            />
            Allow printing
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowCopying}
              onChange={(e) => setAllowCopying(e.target.checked)}
            />
            Allow copying text
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowModifying}
              onChange={(e) => setAllowModifying(e.target.checked)}
            />
            Allow editing / annotations / forms
          </label>
        </fieldset>

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
