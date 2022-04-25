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

const CLOSE_SPIDER_THREAT = 64000000; // 8000 * 8000
const CLOSE_SPIDER_REACH = 36000000; // 6000 * 6000
const CLOSE_DISTANCE = 4840000; // 2200 * 2200
const RANDOM_CLOSE = 640000; // 800 * 800

// * Utils

function distance(e: Entity | Position, e2: Entity | Position): number;
function distance(x: number, y: number, x2: number, y2: number): number;
function distance(
	x_or_e: Entity | Position | number,
	y_or_e2: Entity | Position | number,
	x2?: number,
	y2?: number
): number {
	// return Math.sqrt((Math.pow(x2 - x, 2)) + (Math.pow(y2 - y, 2)))
	if (typeof x_or_e === "number" && typeof y_or_e2 === "number") {
		return (x2 - x_or_e) * (x2 - x_or_e) + (y2 - y_or_e2) * (y2 - y_or_e2);
	}
	return (
		((y_or_e2 as Position).x - (x_or_e as Position).x) * ((y_or_e2 as Position).x - (x_or_e as Position).x) +
		((y_or_e2 as Position).y - (x_or_e as Position).y) * ((y_or_e2 as Position).y - (x_or_e as Position).y)
	);
}

function distanceUnit(unit: number) {
	return unit * unit;
}

function isCloseEnough(e: Entity, e2: Entity): boolean {
	return distance(e.x, e.y, e2.x, e2.y) < CLOSE_DISTANCE;
}

function isCloseEnoughToEnenyBase(e: Entity, ebp: Position): boolean {
	return distance(e.x, e.y, ebp.x, ebp.y) < CLOSE_DISTANCE;
}

function move(position: Entity | Position): Action {
	return { type: ActionType.MOVE, x: position.x, y: position.y };
}

// * Base position

const inputs: string[] = readline().split(" ");
const base: Position = { x: parseInt(inputs[0]), y: parseInt(inputs[1]) }; // The corner of the map representing your base
const enemyBase: Position = {
	x: base.x == 0 ? 17630 : 0,
	y: base.x == 0 ? 9000 : 0,
};
const heroesPerPlayer: number = parseInt(readline()); // Always 3
const defaultPosition: Position = base.x == 0 ? { x: 3600, y: 3400 } : { x: 13600, y: 6000 };
const mapMiddle: Position = { x: 8760, y: 4570 };
const targets: [Entity | null, Entity | null, Entity | null] = [null, null, null];
const randomDestination: [Position | null, Position | null, Position | null] = [null, null, null];
const roles: [Role, Role, Role] = [Role.Protector, Role.Agent, Role.Agent];

// * Utility

const byHeroDistance = (hero: Entity) => (a: Entity, b: Entity) => {
	const aD = distance(hero.x, hero.y, a.x, a.y);
	const bD = distance(hero.x, hero.y, b.x, b.y);
	return aD - bD;
};

// * Game loop

while (true) {
	// Current state
	let health: number = 0;
	let mana: number = 0;
	for (let i = 0; i < 2; i++) {
		const inputs: string[] = readline().split(" ");
		health = parseInt(inputs[0]); // Your base health
		mana = parseInt(inputs[1]); // Ignore in the first league; Spend ten mana to cast a spell
	}

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
		entity.distance = distance(base.x, base.y, entity.x, entity.y);
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

	// Actions
	const targets: Entity[] = [];
	for (let i = 0; i < heroesPerPlayer; i++) {
		const hero = heroes[i];
		let action: Action | undefined;

		// Different roles, different actions

		// Protector
		if (roles[i] === Role.Protector) {
			// Select target
			// If there is no threatening spiders...
			if (threatSpiders.length == 0) {
				// ... select an already targeted
				if (targets.length > 0 /* && isCloseEnough(hero, targets[0]) */) {
					action = move(targets[0]);
				}
				// ... or the closest one
				else if (closestSpiders.length > 0 && isCloseEnough(hero, closestSpiders[0])) {
					const target = closestSpiders.sort(byHeroDistance(hero)).splice(0, 1)[0];
					action = move(target);
					targets.push(target);
				}
			}
			// If there is a really close already targeted spider
			if (targets.length > 0) {
				const spider = targets.sort(byHeroDistance(hero))[0];
				if (spider.distance < CLOSE_SPIDER_REACH && isCloseEnough(hero, spider)) {
					action = move(spider);
				}
			}
			// If there is really no targets select the closest threatening one
			if (!action && threatSpiders.length > 0) {
				const target = threatSpiders.splice(0, 1)[0];
				action = move(target);
				targets.push(target);
			}

			// TODO Cast Wind spell to pushable spiders
			// TODO Cast Control spell to really close spiders
		}
		// Agent
		else {
			// Check if we already have a target
			let target = targets[i];
			if (target) {
				// Cleanup dead entities
				if (entities.findIndex((e) => e.id == target.id) < 0) {
					targets[i] = null;
					target = null;
				}
			}

			// Find a target -- which is not a threat and closest to the hero
			if (!target) {
				const targetSpiders = spiders
					.filter((spider) => threatSpiders.findIndex((ts) => ts.id == spider.id) < 0)
					.sort(byHeroDistance(hero));
				if (targetSpiders.length > 0) {
					target = targetSpiders[0];
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
					destination = randomDestination[i];
					if (distance(hero, destination) < RANDOM_CLOSE) {
						destination = undefined;
						randomDestination[i] = null;
					}
				}
				// TODO Fix calculated distance, heroes goes too far
				if (!destination && distance(hero, mapMiddle) < CLOSE_DISTANCE) {
					const randomMiddle = { ...mapMiddle };
					randomMiddle.x += Math.round(Math.random() * 5000 - 2500);
					randomMiddle.y += Math.round(Math.random() * 5000 - 2500);
					randomDestination[i] = randomMiddle;
					destination = randomDestination[i];
				}
				if (!destination) {
					destination = mapMiddle;
				}
				action = move(destination);
			}
			// If we **do** have a target, try to send spiders to the enemy base
			// -- Keep at least 100 for other higher priority spells
			else if (mana > 100) {
				// TODO Cast control spell to random spiders
			}

			// If we did not cast any spell, just move to our target
			if (!action) {
				action = move(target);
			}
		}

		// Execute action
		if (!action) {
			action = {
				type: ActionType.MOVE,
				x: defaultPosition.x,
				y: defaultPosition.y,
			};
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
		}

		// TODO Recalculate Protector/Agent ratio (round based ?)
	}
}
