// * Types

enum EntityType {
	"monster",
	"hero",
	"opponent",
}

enum Threat {
	"none",
	"self",
	"opponent",
}

enum Role {
	Protector,
	Agent,
}

type Position = {
	x: number;
	y: number;
};

type Entity = Position & {
	id: number;
	type: EntityType;
	shieldLife: number;
	isControlled: boolean;
	health: number;
	vx: number;
	vy: number;
	nearBase: boolean;
	threatFor: Threat;
	distance: number;
	willPush: boolean;
	willControl: boolean;
};

type ControlledEntity = Entity & {
	remaining: number;
};

enum ActionType {
	WAIT,
	MOVE,
	SPELL,
}

enum Spell {
	WIND = "WIND",
	SHIELD = "SHIELD",
	CONTROL = "CONTROL",
}

type Action =
	| {
			type: ActionType.WAIT;
	  }
	| {
			type: ActionType.MOVE;
			x: number;
			y: number;
	  }
	| {
			type: ActionType.SPELL;
			spell: Spell.WIND;
			x: number;
			y: number;
	  }
	| {
			type: ActionType.SPELL;
			spell: Spell.SHIELD;
			entity: number;
	  }
	| {
			type: ActionType.SPELL;
			spell: Spell.CONTROL;
			entity: number;
			x: number;
			y: number;
	  };

const CLOSE_SPIDER_BASE = 25000000; // 5000 * 5000
const CLOSE_SPIDER_DANGER_THRESHOLD = 16000000; // 4000 * 4000
const CLOSE_SPIDER_CONTROL_THRESHOLD = 21160000; // 4600 * 4600
const CLOSE_SPIDER_PUSH_THRESHOLD = 7840000; // 2800 * 2800
const CLOSE_SPIDER_THREAT = 64000000; // 8000 * 8000
const CLOSE_SPIDER_REACH = 36000000; // 6000 * 6000
const CLOSE_DISTANCE = 4840000; // 2200 * 2200
const WIND_RANGE = 1638400; // 1280 * 1280
const CONTROL_RANGE = 4840000; // 2200 * 2200
const TOO_CLOSE_DISTANCE = 5760000; // 2400 * 2400 -- 2000 + movement speed
const RANDOM_CLOSE = 640000; // 800 * 800
const BASE_CONTROL_TIME = 5;

// * Utils

function distance(e: Entity | Position, e2: Entity | Position): number {
	// return Math.sqrt((Math.pow(x2 - x, 2)) + (Math.pow(y2 - y, 2)))
	return (
		((e2 as Position).x - (e as Position).x) * ((e2 as Position).x - (e as Position).x) +
		((e2 as Position).y - (e as Position).y) * ((e2 as Position).y - (e as Position).y)
	);
}

function distanceUnit(unit: number) {
	return unit * unit;
}

function isCloseEnough(e: Entity, e2: Entity): boolean {
	return distance(e, e2) < CLOSE_DISTANCE;
}

function isCloseEnoughToEnenyBase(e: Entity, ebp: Position): boolean {
	return distance(e, ebp) < CLOSE_DISTANCE;
}

function move(position: Entity | Position): Action {
	return { type: ActionType.MOVE, x: position.x, y: position.y };
}

let controlledSpiders: ControlledEntity[] = [];
function control(entity: Entity): Action {
	controlledSpiders.push({ ...entity, remaining: BASE_CONTROL_TIME });
	return { type: ActionType.SPELL, spell: Spell.CONTROL, entity: entity.id, x: enemyBase.x, y: enemyBase.y };
}

function push(entities: Entity[]): Action {
	for (const entity of entities) {
		entity.willPush = true;
	}
	return { type: ActionType.SPELL, spell: Spell.WIND, x: enemyBase.x, y: enemyBase.y };
}

// * Base position

const inputs: string[] = readline().split(" ");
const base: Position = { x: parseInt(inputs[0]), y: parseInt(inputs[1]) }; // The corner of the map representing your base
const enemyBase: Position = { x: base.x == 0 ? 17630 : 0, y: base.x == 0 ? 9000 : 0 };
const heroesPerPlayer: number = parseInt(readline()); // Always 3
const defaultPosition: Position = base.x == 0 ? { x: 3600, y: 3400 } : { x: 13600, y: 6000 };
const mapMiddle: Position = { x: 8760, y: 4570 };
const targets: [Entity | null, Entity | null, Entity | null] = [null, null, null];
const randomDestination: [Position | null, Position | null, Position | null] = [null, null, null];
const roles: [Role, Role, Role] = [Role.Protector, Role.Agent, Role.Agent];

// * Utility

const byHeroDistance = (hero: Entity) => (a: Entity, b: Entity) => {
	return distance(hero, a) - distance(hero, b);
};

// * Common patterns

// Older version with different danger and extract order
function handleAndExtract_v0(hero: Entity, closestSpiders: Entity[], hasAction: boolean) {
	if (closestSpiders.length > 0) {
		// Cast Wind spell to pushable spiders if there is more than 1
		if (closestSpiders.length > 0) {
			const dangerSpiders = closestSpiders
				.filter((spider) => distance(hero, spider) <= WIND_RANGE)
				.filter((spider) => !spider.willPush);
			if (dangerSpiders.length > 1) {
				return push(dangerSpiders);
			}
		}

		// Cast Control spell on spiders that can be extracted from the base but are too far to be pushed
		if (!hasAction) {
			const dangerSpiders = closestSpiders
				.filter((spider) => spider.distance >= CLOSE_SPIDER_CONTROL_THRESHOLD)
				.filter((spider) => distance(hero, spider) <= CONTROL_RANGE)
				.filter((spider) => controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0);
			if (dangerSpiders.length > 0) {
				return control(dangerSpiders[0]);
			}
		}

		// Cast Control spell on spiders that can be extracted from the base but are too far to be pushed
		if (!hasAction) {
			const dangerSpiders = closestSpiders
				.filter((spider) => spider.distance >= CLOSE_SPIDER_CONTROL_THRESHOLD)
				.filter((spider) => distance(hero, spider) <= CONTROL_RANGE)
				.filter((spider) => controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0);
			if (dangerSpiders.length > 0) {
				return control(dangerSpiders[0]);
			}
		}

		// Cast Control spell to really close spiders
		if (closestSpiders.length > 0) {
			const dangerSpiders = closestSpiders
				.filter((spider) => spider.distance <= CLOSE_SPIDER_DANGER_THRESHOLD)
				.filter((spider) => distance(hero, spider) <= CONTROL_RANGE)
				.filter((spider) => controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0);
			if (dangerSpiders.length > 0) {
				return control(dangerSpiders[0]);
			}
		}
	}
	return undefined;
}

function handleAndExtract(hero: Entity, closestSpiders: Entity[]) {
	if (closestSpiders.length > 0) {
		// Cast Control spell to really close spiders
		// -- OR  Cast Wind spell to pushable spiders if there is more than 1
		{
			const dangerSpiders = closestSpiders
				.filter((spider) => spider.distance <= CLOSE_SPIDER_DANGER_THRESHOLD)
				.filter((spider) => controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0)
				.filter((spider) => !spider.willPush);
			const canControl = dangerSpiders.filter((spider) => distance(hero, spider) <= CONTROL_RANGE);
			const canPush = dangerSpiders.filter((spider) => distance(hero, spider) <= WIND_RANGE);
			if (canPush.length > 1) {
				return push(canPush);
			} else if (canControl.length > 0) {
				return control(canControl[0]);
			}
		}

		// Cast Control spell on spiders that can be extracted from the base but are too far to be pushed
		// -- OR Cast Wind spell to pushable spiders if there is more than 1
		{
			const dangerSpiders = closestSpiders
				.filter((spider) => controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0)
				.filter((spider) => !spider.willPush);
			const canControl = dangerSpiders
				.filter((spider) => spider.distance >= CLOSE_SPIDER_CONTROL_THRESHOLD)
				.filter((spider) => distance(hero, spider) <= CONTROL_RANGE);
			const canPush = dangerSpiders
				.filter((spider) => spider.distance >= CLOSE_SPIDER_PUSH_THRESHOLD)
				.filter((spider) => distance(hero, spider) <= WIND_RANGE);
			if (canPush.length > 1) {
				return push(canPush);
			} else if (canControl.length > 0) {
				return control(canControl[0]);
			}
		}
	}
	return undefined;
}

// * Game loop

while (true) {
	// Current state
	const selfStatus: string[] = readline().split(" ");
	let health: number = parseInt(selfStatus[0]); // Your base health
	let mana: number = parseInt(selfStatus[1]); // Spend ten mana to cast a spell
	const enemyStatus: string[] = readline().split(" ");
	let enemyHealth: number = parseInt(enemyStatus[0]);
	let enemyMana: number = parseInt(enemyStatus[1]);

	// Entities
	const entityCount: number = parseInt(readline()); // Amount of heros and monsters you can see
	const heroes: Entity[] = [];
	const entities: Entity[] = [];
	const spiders: Entity[] = [];
	for (let i = 0; i < entityCount; i++) {
		const inputs: string[] = readline().split(" ");
		const entity: Entity = {
			id: parseInt(inputs[0]), // Unique identifier
			type: parseInt(inputs[1]), // 0=monster, 1=your hero, 2=opponent hero
			x: parseInt(inputs[2]), // Position of this entity
			y: parseInt(inputs[3]),
			shieldLife: parseInt(inputs[4]), // Count down until shield spell fades
			isControlled: parseInt(inputs[5]) == 1, // Equals 1 when this entity is under a control spell
			health: parseInt(inputs[6]), // Remaining health of this monster
			vx: parseInt(inputs[7]), // Trajectory of this monster
			vy: parseInt(inputs[8]),
			nearBase: parseInt(inputs[9]) == 1, // 0=monster with no target yet, 1=monster targeting a base
			threatFor: parseInt(inputs[10]), // Given this monster's trajectory, is it a threat to 1=your base, 2=your opponent's base, 0=neither
			distance: 0,
			willPush: false,
			willControl: false,
		};
		entity.distance = distance(base, entity);
		entities.push(entity);
		if (entity.type == EntityType.monster) {
			spiders.push(entity);
		} else if (entity.type == EntityType.hero) {
			heroes.push(entity);
		}
	}
	const closestSpiders = spiders
		.filter((spider) => spider.distance < CLOSE_SPIDER_THREAT)
		.sort((a, b) => a.distance - b.distance);
	const threatSpiders = closestSpiders.filter((spider) => spider.threatFor == Threat.self);

	// Cleanup controlled spiders -- remove dead and update remaining
	for (const spider of controlledSpiders) {
		spider.remaining -= 1;
	}
	controlledSpiders = controlledSpiders.filter(
		(cs) => spiders.findIndex((s) => s.id === cs.id) < 0 || cs.remaining < 0
	);

	// Actions
	const turnTargets: Entity[] = [];
	for (let i = 0; i < heroesPerPlayer; i++) {
		const hero = heroes[i];
		let action: Action | undefined;

		// Different roles, different actions

		// Protector
		if (roles[i] === Role.Protector) {
			// Select target
			let target: Entity | undefined;
			// If there is no threatening spiders...
			if (threatSpiders.length == 0) {
				// ... select an already targeted
				if (turnTargets.length > 0 /* && isCloseEnough(hero, turnTargets[0]) */) {
					target = turnTargets[0];
					action = move(target);
				}
				// ... or the closest one
				else if (closestSpiders.length > 0 && isCloseEnough(hero, closestSpiders[0])) {
					target = closestSpiders.sort(byHeroDistance(hero)).splice(0, 1)[0];
					action = move(target);
					turnTargets.push(target);
				}
			}
			// If there is a really close already targeted spider
			if (turnTargets.length > 0) {
				const spider = turnTargets.sort(byHeroDistance(hero))[0];
				if (spider.distance < CLOSE_SPIDER_REACH && isCloseEnough(hero, spider)) {
					target = spider;
					action = move(spider);
				}
			}
			// If there is really no targets select the closest threatening one
			if (!action && threatSpiders.length > 0) {
				target = threatSpiders.splice(0, 1)[0];
				action = move(target);
				turnTargets.push(target);
			}

			// Common patterns
			if (mana > 10) {
				const response = handleAndExtract_v0(hero, closestSpiders, action !== undefined);
				// const response = handleAndExtract(hero, closestSpiders);
				if (response) action = response;
			}

			// Move if there is a target and no spells to cast
			if (target && !action) {
				action = move(target);
			}
			if (!action) {
				action = move(defaultPosition);
			}
		}
		// Agent
		else {
			// Check if we already have a target
			let target = targets[i];
			// Cleanup dead entities
			if (target && entities.findIndex((e) => e.id == target!.id) < 0) {
				targets[i] = null;
				target = null;
			}

			// Find a target -- which is not a threat and closest to the hero
			if (!target) {
				const targetSpiders = spiders
					.filter((spider) => threatSpiders.findIndex((ts) => ts.id == spider.id) < 0)
					// Still target controlled spiders that are in our base
					.filter(
						(spider) =>
							controlledSpiders.findIndex((cs) => cs.id == spider.id) < 0 ||
							spider.distance < CLOSE_SPIDER_BASE
					)
					.sort(byHeroDistance(hero));
				if (targetSpiders.length > 0) {
					// Focus the closest AND any threat to ourself
					const threatSpiders = targetSpiders.filter((spider) => spider.threatFor === Threat.self);
					if (threatSpiders.length > 0) {
						target = threatSpiders[0];
					} else {
						target = targetSpiders[0];
					}
					randomDestination[i] = null;
				}
			}

			// ... if there is none move the middle of the map
			if (!target) {
				// -- or a random location near it
				// -- location is set once and cleared when a target is found
				// -- or when it's reached again
				let destination: Position | undefined;
				if (randomDestination[i]) {
					destination = randomDestination[i]!;
					if (distance(hero, destination) < RANDOM_CLOSE) {
						destination = undefined;
						randomDestination[i] = null;
					}
				}
				// TODO Fix calculated distance, heroes goes too far ?
				// TODO Move closer to the enemy base
				// TODO Check if target can be pushed inside the enemy base with wind spell
				if (!destination && distance(hero, mapMiddle) < CLOSE_DISTANCE) {
					const randomMiddle = { ...mapMiddle };
					randomMiddle.x += Math.round(Math.random() * 5000 - 2500);
					randomMiddle.y += Math.round(Math.random() * 5000 - 2500);
					randomDestination[i] = randomMiddle;
					destination = randomDestination[i]!;
				}
				if (!destination) {
					destination = mapMiddle;
				}
				action = move(destination);
			}
			// If we **do** have a target, try to send spiders to the enemy base
			// -- Keep at least 100 for other higher priority spells
			else if (mana > 100) {
				const controllableSpiders = spiders
					.filter((spider) => distance(hero, spider) <= CONTROL_RANGE)
					.filter((spider) => controlledSpiders.findIndex((c) => c.id === spider.id) < 0)
					.filter((spider) => spider.threatFor === Threat.none)
					.filter((spider) => targets.findIndex((t) => t !== null && t.id === spider.id) < 0);
				if (controllableSpiders.length > 0) {
					const spider = controllableSpiders[0];
					action = control(spider);
				}
			}

			// Common patterns
			if (mana > 10) {
				const response = handleAndExtract_v0(hero, closestSpiders, action !== undefined);
				// const response = handleAndExtract(hero, closestSpiders);
				if (response) action = response;
			}

			// If we did not cast any spell, just move to our target
			if (!action && target) {
				action = move(target);
			} else {
				action = move(mapMiddle);
			}
		}

		// Execute action
		if (!action) {
			action = { type: ActionType.MOVE, x: defaultPosition.x, y: defaultPosition.y };
		}
		if (action.type === ActionType.WAIT) {
			console.log("WAIT");
		} else if (action.type === ActionType.MOVE) {
			console.log(`MOVE ${action.x} ${action.y}`);
		} else {
			if (action.spell === Spell.WIND) {
				console.log(`SPELL ${action.spell} ${action.x} ${action.y}`);
			} else if (action.spell === Spell.CONTROL) {
				console.log(`SPELL ${action.spell} ${action.entity} ${action.x} ${action.y}`);
			} else {
				console.log(`SPELL ${action.spell} ${action.entity}`);
			}
			mana -= 10;
		}

		// TODO Recalculate Protector/Agent ratio (round based ?)
	}
}
