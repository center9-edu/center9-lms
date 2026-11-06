'use client';

import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import styles from '../practice.module.css';

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

  return <div ref={containerRef} className={styles.editor} />;
}
