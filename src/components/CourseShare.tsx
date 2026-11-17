import { isTauri } from "@tauri-apps/api/core";
import { Button } from "@ui-sdk/react/button";
import { useRef, useState } from "react";
import { rpc, type CourseExport, type Progress } from "../api";
import { sfx } from "../sound";

function ExportCourseButton({ courseId }: { courseId: string }) {
  const [message, setMessage] = useState<string>();

  async function exportCourse() {
    try {
      const file = await rpc<CourseExport>("course.export", { courseId });
      if (!isTauri()) {
        const url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }));
        const link = Object.assign(document.createElement("a"), { href: url, download: file.fileName });
        link.click();
        URL.revokeObjectURL(url);
      }
      sfx.play("export");
      setMessage(file.savedTo ? `Saved to ${file.savedTo}. It holds the course and its lesson plans, nothing about you.` : `Downloaded ${file.fileName}.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="share">
      <Button onClick={() => void exportCourse()}>Share this course as a file</Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function ImportCourseButton({ onImported }: { onImported: (course: Progress) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  async function importFile(file: File) {
    setError(undefined);
    try {
      const course = await rpc<Progress | null>("course.import", { json: await file.text() });
      if (!course?.id) throw new Error("The course didn't open. Try again in a moment.");
      sfx.play("import");
      onImported(course);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="share">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Course file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <Button onClick={() => input.current?.click()}>Open a shared course</Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { ExportCourseButton, ImportCourseButton };
