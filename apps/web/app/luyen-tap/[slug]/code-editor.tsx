'use client';

import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

interface CodeEditorProps {
  initialCode: string;
  onChange: (code: string) => void;
}

/** Uncontrolled: remount with a new `key` to reset the content. `onChange` must be stable. */
export function CodeEditor({ initialCode, onChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      doc: initialCode,
      parent: containerRef.current ?? undefined,
      extensions: [
        basicSetup,
        python(),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Ô viết code Python' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
    return () => view.destroy();
  }, [initialCode, onChange]);

  // CodeMirror injects its own unlayered styles, so the focus outline needs `!` to beat them.
  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg border border-solid border-border text-[0.9375rem] [&_.cm-editor]:max-h-[55vh] [&_.cm-editor]:min-h-56 [&_.cm-editor.cm-focused]:outline-2! [&_.cm-editor.cm-focused]:-outline-offset-2! [&_.cm-editor.cm-focused]:outline-primary! [&_.cm-scroller]:min-h-56 min-[56rem]:[&_.cm-editor]:min-h-72 min-[56rem]:[&_.cm-scroller]:min-h-72"
    />
  );
}
