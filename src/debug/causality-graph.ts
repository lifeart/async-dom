/**
 * Causality Graph — Feature 15
 *
 * Builds a DAG: Event -> MutationBatch -> Affected Nodes
 * from logged mutations and events. Each mutation batch is
 * tagged with its causal event (click, input, timer, etc.).
 */

export interface CausalEvent {
	eventType: string;
	listenerId: string;
	timestamp: number;
}

export interface CausalBatch {
	batchUid: number;
	causalEvent: CausalEvent | null;
	nodeIds: Set<number>;
	mutationCount: number;
	timestamp: number;
}

export interface CausalityNode {
	type: "event" | "batch" | "node";
	id: string;
	label: string;
	children: string[];
}

export interface CausalityGraph {
	nodes: Map<string, CausalityNode>;
	roots: string[];
}

/**
 * Build a causality DAG from batch records.
 */
export function buildCausalityGraph(batches: CausalBatch[]): CausalityGraph {
	const nodes = new Map<string, CausalityNode>();
	const roots: string[] = [];

	// Group batches by their causal event
	const eventMap = new Map<string, CausalBatch[]>();
	const orphanBatches: CausalBatch[] = [];

	for (const batch of batches) {
		if (batch.causalEvent) {
			const eventKey = `event:${batch.causalEvent.eventType}:${batch.causalEvent.listenerId}:${batch.causalEvent.timestamp}`;
			if (!eventMap.has(eventKey)) {
				eventMap.set(eventKey, []);
			}
			eventMap.get(eventKey)!.push(batch);
		} else {
			orphanBatches.push(batch);
		}
	}

	// Create event nodes
	for (const [eventKey, eventBatches] of eventMap) {
		const firstBatch = eventBatches[0];
		const evt = firstBatch.causalEvent!;
		const eventNode: CausalityNode = {
			type: "event",
			id: eventKey,
			label: `${evt.eventType} (${evt.listenerId})`,
			children: [],
		};

		for (const batch of eventBatches) {
			const batchKey = `batch:${batch.batchUid}`;
			const batchNode: CausalityNode = {
				type: "batch",
				id: batchKey,
				label: `Batch #${batch.batchUid} (${batch.mutationCount} muts)`,
				children: [],
			};

			for (const nodeId of batch.nodeIds) {
				const nodeKey = `node:${nodeId}`;
				if (!nodes.has(nodeKey)) {
					nodes.set(nodeKey, {
						type: "node",
						id: nodeKey,
						label: `#${nodeId}`,
						children: [],
					});
				}
				batchNode.children.push(nodeKey);
			}

			nodes.set(batchKey, batchNode);
			eventNode.children.push(batchKey);
		}

		nodes.set(eventKey, eventNode);
		roots.push(eventKey);
	}

	// Orphan batches (no causal event)
	for (const batch of orphanBatches) {
		const batchKey = `batch:${batch.batchUid}`;
		const batchNode: CausalityNode = {
			type: "batch",
			id: batchKey,
			label: `Batch #${batch.batchUid} (${batch.mutationCount} muts, no event)`,
			children: [],
		};

		for (const nodeId of batch.nodeIds) {
			const nodeKey = `node:${nodeId}`;
			if (!nodes.has(nodeKey)) {
				nodes.set(nodeKey, {
					type: "node",
					id: nodeKey,
					label: `#${nodeId}`,
					children: [],
				});
			}
			batchNode.children.push(nodeKey);
		}

		nodes.set(batchKey, batchNode);
		roots.push(batchKey);
	}

	return { nodes, roots };
}

/**
 * Storage for causal batch records, maintained on the main thread.
 */
export class CausalityTracker {
	private batches: CausalBatch[] = [];
	private maxBatches = 100;

	/** Record a batch with its causal event */
	recordBatch(
		batchUid: number,
		nodeIds: number[],
		mutationCount: number,
		causalEvent: CausalEvent | null,
	): void {
		this.batches.push({
			batchUid,
			causalEvent,
			nodeIds: new Set(nodeIds),
			mutationCount,
			timestamp: Date.now(),
		});
		if (this.batches.length > this.maxBatches) {
			this.batches.shift();
		}
	}

	/** Get all recorded batches */
	getBatches(): CausalBatch[] {
		return this.batches.slice();
	}

	/** Build the DAG from recorded batches */
	buildGraph(): CausalityGraph {
		return buildCausalityGraph(this.batches);
	}

	/** Find batches that affected a given nodeId */
	findBatchesForNode(nodeId: number): CausalBatch[] {
		return this.batches.filter((b) => b.nodeIds.has(nodeId));
	}

	/** Clear all records */
	clear(): void {
		this.batches.length = 0;
	}
}
