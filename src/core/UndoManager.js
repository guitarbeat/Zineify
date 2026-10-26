/**
 * UndoManager.js
 * Lightweight undo/redo stack for page-level operations.
 * Each entry is a snapshot of allPageImages / pageFlips / pageRotations / pageZooms.
 * onPrune is called when an entry is pushed off the bottom of the stack,
 * giving the caller a chance to free resources (e.g. revoke blob URLs).
 */
export class UndoManager {
  constructor(maxHistory = 20) {
    this._stack = [];
    this._redoStack = [];
    this._max = maxHistory;
  }

  /** Push a snapshot onto the stack. Prunes the oldest entry if full. */
  push({ description, allPageImages, pageFlips, pageRotations, pageZooms, pageTransforms, layoutPresetId, gridSize, onPrune = null }) {
    this._stack.push({ description, allPageImages, pageFlips, pageRotations, pageZooms, pageTransforms, layoutPresetId, gridSize, onPrune });
    this._redoStack.splice(0).forEach((entry) => entry.onPrune?.());
    if (this._stack.length > this._max) {
      const pruned = this._stack.shift();
      pruned.onPrune?.();
    }
  }

  /** Pop the most-recent snapshot (returns null when empty). */
  pop() {
    return this._stack.pop() ?? null;
  }

  /** Move the latest undo entry to redo and return it. */
  undo(currentSnapshot = null) {
    const entry = this._stack.pop() ?? null;
    if (!entry) { return null; }
    if (currentSnapshot) { this._redoStack.push(currentSnapshot); }
    return entry;
  }

  /** Restore the latest redo entry and move the current state to undo. */
  redo(currentSnapshot = null) {
    const entry = this._redoStack.pop() ?? null;
    if (!entry) { return null; }
    if (currentSnapshot) { this._stack.push(currentSnapshot); }
    return entry;
  }

  /** Clear the entire stack, calling onPrune for each entry. */
  clear() {
    while (this._stack.length) { this._stack.pop()?.onPrune?.(); }
    while (this._redoStack.length) { this._redoStack.pop()?.onPrune?.(); }
  }

  get size() { return this._stack.length; }
  get undoSize() { return this._stack.length; }
  get redoSize() { return this._redoStack.length; }
  get isEmpty() { return this._stack.length === 0; }
  get canUndo() { return this._stack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }
}
