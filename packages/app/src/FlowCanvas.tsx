/**
 * One traced flow on the canvas: pan and zoom, lane folding, the ordered step list, the selection
 * panel with the evidence of an inferred edge, and a node click that opens the editor at the
 * node's file and line. Every decision about what to draw is the canvas model's, so this module
 * only hands it to Cytoscape and wires the clicks back (ADR-0003).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { buildCanvasModel, describeSelection } from '@archmap/canvas-model';
import type { Anchor, CanvasModel, CanvasSelection, CanvasStep } from '@archmap/canvas-model';
import type { FlowDocument } from '@archmap/flow-document';
import { canvasStyle, coloursOf, elementsOf } from './canvas-elements.ts';

export interface FlowCanvasProps {
  readonly flow: FlowDocument;
  readonly onOpenAnchor: (anchor: Anchor) => void;
  /** Hands over the Cytoscape graph once it is created, for a caller that drives it directly. */
  readonly onGraph?: (graph: Core) => void;
}

const ZOOM_STEP = 1.25;
const FIT_PADDING = 40;

const KIND_WORDS: Readonly<Record<string, string>> = {
  step: 'Step',
  decision: 'Decision',
  error: 'Error exit',
  'side-effect': 'Side effect',
};

const SelectionPanel = ({
  model,
  selection,
  onOpenAnchor,
  onUnfold,
}: {
  readonly model: CanvasModel;
  readonly selection: CanvasSelection | null;
  readonly onOpenAnchor: (anchor: Anchor) => void;
  readonly onUnfold: (laneId: string) => void;
}) => {
  if (selection === null) {
    return (
      <>
        <h3>{model.flowName}</h3>
        <p>
          {String(model.steps.length)} steps across {String(model.lanes.length)} lanes. Click a node
          to open it in the editor, or an edge to read its evidence.
        </p>
      </>
    );
  }
  if (selection.kind === 'node') {
    const { node } = selection;
    if (node.anchor === null) {
      return (
        <>
          <h3>{node.label}</h3>
          <p>{String(node.collapsedCount)} nodes folded</p>
          <button
            type="button"
            onClick={() => {
              onUnfold(node.lane);
            }}
          >
            Unfold
          </button>
        </>
      );
    }
    const { anchor } = node;
    return (
      <>
        <h3>{node.label}</h3>
        <p>{KIND_WORDS[node.kind] ?? node.kind}</p>
        <p>
          <code>
            {anchor.file}:{anchor.line}
          </code>
        </p>
        <button
          type="button"
          onClick={() => {
            onOpenAnchor(anchor);
          }}
        >
          Open in editor
        </button>
      </>
    );
  }
  if (selection.kind === 'edge') {
    const { edge, evidence } = selection;
    return (
      <>
        <h3>{edge.kind === 'verified' ? 'Verified edge' : 'Inferred edge'}</h3>
        <p>
          {edge.kind === 'verified'
            ? 'The reference graph proves this hop.'
            : 'No static reference proves this hop. It crosses a boundary, and this evidence proposes it.'}
        </p>
        {evidence.length === 0 ? null : (
          <ul className="evidence">
            {evidence.map((item) => (
              <li key={`${item.file}:${String(item.line)}:${item.quote}`}>
                <blockquote>{item.quote}</blockquote>
                <code>
                  {item.file}:{item.line}
                </code>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  return <h3>{selection.lane.name}</h3>;
};

const StepList = ({
  steps,
  selectedId,
  onReveal,
}: {
  readonly steps: readonly CanvasStep[];
  readonly selectedId: string | null;
  readonly onReveal: (step: CanvasStep) => void;
}) => (
  <ol aria-label="Steps" className="steps">
    {steps.map((step) => (
      <li
        key={step.id}
        className={[
          `kind-${step.kind}`,
          step.folded ? 'folded' : '',
          step.id === selectedId ? 'current' : '',
        ]
          .filter((name) => name !== '')
          .join(' ')}
      >
        <button
          type="button"
          onClick={() => {
            onReveal(step);
          }}
        >
          <span className="num">{step.order}</span>
          {step.label}
        </button>
      </li>
    ))}
  </ol>
);

export const FlowCanvas = ({ flow, onOpenAnchor, onGraph }: FlowCanvasProps) => {
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const model = useMemo(
    () => buildCanvasModel(flow, { collapsedLanes: collapsed }),
    [flow, collapsed],
  );
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | null>(null);
  const fitted = useRef(false);
  const latest = useRef({ model, onOpenAnchor, onGraph });
  latest.current = { model, onOpenAnchor, onGraph };

  useEffect(() => {
    if (container.current === null) return undefined;
    const cy = cytoscape({
      container: container.current,
      style: canvasStyle(coloursOf(document.documentElement)),
      layout: { name: 'preset' },
      minZoom: 0.08,
      maxZoom: 2.5,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    cy.on('tap', 'node', (event) => {
      const id = (event.target as { id(): string }).id();
      setSelectedId(id);
      const selection = describeSelection(latest.current.model, id);
      if (selection?.kind === 'node' && selection.node.anchor !== null) {
        latest.current.onOpenAnchor(selection.node.anchor);
      }
    });
    cy.on('tap', 'edge', (event) => {
      setSelectedId((event.target as { id(): string }).id());
    });
    cy.on('tap', (event) => {
      if (event.target === cy) setSelectedId(null);
    });
    graph.current = cy;
    fitted.current = false;
    latest.current.onGraph?.(cy);
    return () => {
      graph.current = null;
      cy.destroy();
    };
  }, []);

  useEffect(() => {
    const cy = graph.current;
    if (cy === null) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elementsOf(model));
    });
    if (!fitted.current) {
      cy.fit(undefined, FIT_PADDING);
      fitted.current = true;
    }
  }, [model]);

  useEffect(() => {
    const cy = graph.current;
    if (cy === null) return;
    cy.elements(':selected').unselect();
    if (selectedId === null) return;
    const element = cy.getElementById(selectedId);
    if (element.length === 0) return;
    element.select();
    if (element.isNode()) cy.animate({ center: { eles: element } }, { duration: 180 });
  }, [model, selectedId]);

  const setFolded = (laneId: string, folded: boolean): void => {
    setCollapsed((before) =>
      folded
        ? [...before.filter((id) => id !== laneId), laneId]
        : before.filter((id) => id !== laneId),
    );
  };

  const zoomBy = (factor: number): void => {
    const cy = graph.current;
    if (cy === null) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const reveal = (step: CanvasStep): void => {
    if (step.folded) setFolded(step.lane, false);
    setSelectedId(step.id);
  };

  const selection = selectedId === null ? null : describeSelection(model, selectedId);

  return (
    <section aria-label="Flow canvas" className="flow-canvas">
      <div className="toolbar" role="toolbar" aria-label="Canvas tools">
        {model.lanes
          .filter((lane) => lane.nodeCount > 0)
          .map((lane) => (
            <button
              key={lane.id}
              type="button"
              aria-pressed={lane.collapsed}
              aria-label={`${lane.collapsed ? 'Unfold' : 'Fold'} ${lane.name}`}
              onClick={() => {
                setFolded(lane.id, !lane.collapsed);
              }}
            >
              {lane.collapsed ? '▸' : '▾'} {lane.name}
            </button>
          ))}
        <span className="spacer" />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            zoomBy(ZOOM_STEP);
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            zoomBy(1 / ZOOM_STEP);
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            graph.current?.fit(undefined, FIT_PADDING);
          }}
        >
          Fit
        </button>
      </div>
      <div className="canvas-body">
        <StepList steps={model.steps} selectedId={selectedId} onReveal={reveal} />
        <div ref={container} className="cytoscape" data-testid="cytoscape" />
        <aside aria-label="Selection" className="selection">
          <SelectionPanel
            model={model}
            selection={selection}
            onOpenAnchor={onOpenAnchor}
            onUnfold={(laneId) => {
              setFolded(laneId, false);
            }}
          />
        </aside>
      </div>
    </section>
  );
};
