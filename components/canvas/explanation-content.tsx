"use client";

import React, { useMemo } from "react";

interface ExplanationContentProps {
  content: string;
  allFilePaths: string[];
  onSelectFile?: (filePath: string) => void;
}

/**
 * Custom strict renderer for Phase 10 explanations.
 * Supports EXACTLY three formatting features:
 * 1. Bold: **bold**
 * 2. Bullets: - bullet
 * 3. Inline code: `code` (repository paths become clickable links)
 * 
 * Enforces NO headings and ensures NO stray backticks, asterisks, or hash symbols.
 */
export function ExplanationContent({
  content,
  allFilePaths,
  onSelectFile,
}: ExplanationContentProps) {
  const filePathSet = useMemo(() => new Set(allFilePaths), [allFilePaths]);

  // Pre-clean content: strip any lingering heading hashes at line starts
  const cleanedContent = useMemo(() => {
    return content
      .replace(/^#{1,6}\s+/gm, "") // Strip leading # marks
      .replace(/```[a-z]*\n?/gi, "") // Strip code fences
      .trim();
  }, [content]);

  // Splits line into tokens of (bold, code, plain text)
  const renderInline = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    // Tokenize by `code` and **bold**
    // Regex matches either `code` or **bold**
    const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    let keyIdx = 0;
    while ((match = regex.exec(text)) !== null) {
      // Plain text before match
      if (match.index > lastIndex) {
        const plain = text.slice(lastIndex, match.index);
        // Clean stray markdown symbols from plain text
        const sanitized = plain.replace(/[*`#]/g, "");
        if (sanitized) {
          nodes.push(<span key={keyIdx++}>{sanitized}</span>);
        }
      }

      const token = match[0];
      if (token.startsWith("`") && token.endsWith("`")) {
        const rawCode = token.slice(1, -1).trim();
        // Check if rawCode is or ends with a known repository file
        const isRepoFile = filePathSet.has(rawCode);

        if (isRepoFile && onSelectFile) {
          nodes.push(
            <button
              key={keyIdx++}
              type="button"
              onClick={() => onSelectFile(rawCode)}
              className="inline-flex items-center font-mono font-medium text-accent hover:underline hover:text-accent cursor-pointer bg-accent/10 px-1 py-0.5 rounded text-[11px] border border-accent/20 transition-colors mx-0.5"
              title={`Focus ${rawCode} on map`}
            >
              {rawCode}
            </button>
          );
        } else {
          nodes.push(
            <code
              key={keyIdx++}
              className="font-mono text-foreground bg-surface-raised px-1 py-0.2 rounded text-[11px] border border-border/80 mx-0.5"
            >
              {rawCode}
            </code>
          );
        }
      } else if (token.startsWith("**") && token.endsWith("**")) {
        const boldText = token.slice(2, -2).trim();
        nodes.push(
          <strong key={keyIdx++} className="font-semibold text-foreground">
            {boldText}
          </strong>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex).replace(/[*`#]/g, "");
      if (remaining) {
        nodes.push(<span key={keyIdx++}>{remaining}</span>);
      }
    }

    return nodes;
  };

  // Group lines into paragraphs and bullet lists
  const blocks = useMemo(() => {
    const lines = cleanedContent.split("\n");
    const result: Array<{ type: "p" | "ul"; items: string[] }> = [];
    let currentBulletList: string[] = [];

    const flushBullets = () => {
      if (currentBulletList.length > 0) {
        result.push({ type: "ul", items: [...currentBulletList] });
        currentBulletList = [];
      }
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flushBullets();
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        currentBulletList.push(trimmed.slice(2).trim());
      } else {
        flushBullets();
        result.push({ type: "p", items: [trimmed] });
      }
    }

    flushBullets();
    return result;
  }, [cleanedContent]);

  return (
    <div className="space-y-2.5 text-xs text-foreground/90 leading-relaxed font-sans select-text">
      {blocks.map((block, idx) => {
        if (block.type === "ul") {
          return (
            <ul key={idx} className="space-y-1.5 pl-4 list-disc marker:text-accent text-[11px]">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-normal">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInline(block.items[0])}
          </p>
        );
      })}
    </div>
  );
}