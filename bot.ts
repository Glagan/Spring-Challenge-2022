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
	willShield: boolean;
};

type HeroRanking = [number, number, number];

type DangerGroup = {
	assigned: false;
	entities: Entity[];
	center: Position;
	closest: HeroRanking;
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

type Action = { type: ActionType };

type WaitAction = Action & {
	type: ActionType.WAIT;
};

type MoveAction = Action &
	Position & {
		type: ActionType.MOVE;
	};

type SpellAction = Action & {
	type: ActionType.SPELL;
};

type PushAction = SpellAction &
	Position & {
		spell: Spell.WIND;
	};

type ShieldAction = SpellAction & {
	spell: Spell.SHIELD;
	entity: number;
};

type ControlAction = SpellAction &
	Position & {
		spell: Spell.CONTROL;
		entity: number;
	};

type AnyAction = WaitAction | MoveAction | SpellAction | PushAction | ShieldAction | ControlAction;

// * Constants

const FOG_BASE = 36000000; // 6000 * 6000
const HERO_VIEW = 4840000; // 2200 * 2200
const WIND_RANGE = 1638400; // 1280 * 1280
const CONTROL_RANGE = 4840000; // 2200 * 2200
const SHIELD_RANGE = CONTROL_RANGE;
const BARYCENTER_RADIUS = 2560000; // 1600 * 1600

// * Utilities

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

function move(position: Entity | Position): MoveAction {
	return { type: ActionType.MOVE, x: position.x, y: position.y };
}

function control(entity: Entity): ControlAction {
	entity.willControl = true;
	return { type: ActionType.SPELL, spell: Spell.CONTROL, entity: entity.id, x: enemyBase.x, y: enemyBase.y };
}

function shield(entity: Entity): ShieldAction {
	entity.willShield = true;
	return { type: ActionType.SPELL, spell: Spell.SHIELD, entity: entity.id };
}

function push(entities: Entity[]): PushAction {
	for (const entity of entities) {
		entity.willPush = true;
	}
	return { type: ActionType.SPELL, spell: Spell.WIND, x: enemyBase.x, y: enemyBase.y };
}

// * State

const inputs: string[] = readline().split(" ");
const base: Position = { x: parseInt(inputs[0]), y: parseInt(inputs[1]) }; // The corner of the map representing your base
const baseIsAtZero = base.x === 0;
const enemyBase: Position = { x: baseIsAtZero ? 17630 : 0, y: baseIsAtZero ? 9000 : 0 };
const heroesPerPlayer: number = parseInt(readline()); // Always 3
const zones: [Position, Position, Position] = [
	{ x: 5000, y: 4700 }, // Center
	{ x: 6640, y: 1760 }, // Top
	{ x: 1950, y: 6500 }, // Bottom
];
if (!baseIsAtZero) {
	zones[0] = { x: base.x - zones[0].x, y: base.y - zones[0].y };
	zones[1] = { x: base.x - zones[1].x, y: base.y - zones[1].y };
	zones[2] = { x: base.x - zones[2].x, y: base.y - zones[2].y };
}
const shouldBeInZone: HeroRanking = [0, 1, 2];
let enemyCanAttack: boolean = false;
let enemyDoShield: boolean = false;

// * Utilities

// sort(byHeroDistance(hero))
const byHeroDistance = (hero: Entity) => (a: Entity, b: Entity) => {
	return distance(hero, a) - distance(hero, b);
};

// sort(byDistance)
const byDistance = (a: Entity, b: Entity) => {
	return a.distance - b.distance;
};

// filter(notIn(entities))
const notIn = (other: Entity[]) => (a: Entity) => {
	return other.findIndex((b) => b.id === a.id) < 0;
};

// * Patterns

/*function handleAndExtract(hero: Entity, closestSpiders: Entity[]) {
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
}*/

// * Game loop

while (true) {
	const startTime = +new Date();

	// * Current state
	const selfStatus: string[] = readline().split(" ");
	let health: number = parseInt(selfStatus[0]); // Your base health
	let mana: number = parseInt(selfStatus[1]); // Spend ten mana to cast a spell
	const enemyStatus: string[] = readline().split(" ");
	let enemyHealth: number = parseInt(enemyStatus[0]);
	let enemyMana: number = parseInt(enemyStatus[1]);

	// * Entities
	const entityCount: number = parseInt(readline()); // Amount of heros and monsters you can see
	const heroes: Entity[] = [];
	const enemies: Entity[] = [];
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
			willShield: false,
		};
		entity.distance = distance(base, entity);
		if (entity.type === EntityType.monster) {
			spiders.push(entity);
		} else if (entity.type === EntityType.hero) {
			heroes.push(entity);
		} else {
			enemies.push(entity);
		}
	}
	const dangerSpiders = spiders
		.filter((spider) => spider.nearBase && spider.threatFor === Threat.self)
		.sort(byDistance);
	const threatSpiders = spiders.filter((spider) => spider.threatFor == Threat.self).sort(byDistance);

	// * Create group of danger spiders that heroes can kill
	// They are calculated on each turns to update automatically and balance heroes if needed
	const dangerStartTime = +new Date();
	let dangerGroups: DangerGroup[] = [];
	if (dangerSpiders.length > 0) {
		// Create a group of spiders for each spiders as a starting point
		// And select the group of groups with the biggest average
		let dangerGroupAverage = -1;
		for (const spider of dangerSpiders) {
			// Start with the current spider
			const dangerSpidersCopy = [
				{ ...spider, used: false },
				...dangerSpiders.filter((o) => o.id != spider.id).map((s) => ({ ...s, used: false })),
			];
			const currentSpiderDangerGroups: DangerGroup[] = [];

			// Generate groups
			for (const dangerSpider of dangerSpidersCopy) {
				if (dangerSpider.used) continue;
				const closeSpiders = dangerSpidersCopy.filter(
					(other) => !other.used && distance(dangerSpider, other) < BARYCENTER_RADIUS
				);
				if (closeSpiders.length > 0) {
					for (const spider of closeSpiders) {
						spider.used = true;
					}
					currentSpiderDangerGroups.push({
						assigned: false,
						entities: closeSpiders,
						center: { x: 0, y: 0 },
						closest: [0, 0, 0],
					});
				}
			}

			// Check if it's better than the current one and save it if so
			if (currentSpiderDangerGroups.length > 0) {
				const currentWeight =
					currentSpiderDangerGroups.reduce((carry, group) => {
						return carry + group.entities.length;
					}, 0) / currentSpiderDangerGroups.length;
				if (currentWeight > dangerGroupAverage) {
					dangerGroups = currentSpiderDangerGroups;
				}
			}
		}
	}
	if (dangerGroups.length > 0) {
		for (const dangerGroup of dangerGroups) {
			if (dangerGroup.entities.length > 1) {
				// TODO Barycenter of the danger group entities
			} else {
				dangerGroup.center = { x: dangerGroup.entities[0].x, y: dangerGroup.entities[0].y };
			}
			const heroDistances = [
				distance(heroes[0], dangerGroup.center),
				distance(heroes[1], dangerGroup.center),
				distance(heroes[2], dangerGroup.center),
			];
			dangerGroup.closest = [...heroDistances].sort().map((v) => heroDistances.indexOf(v)) as HeroRanking;
		}
	}
	const dangerEndTime = +new Date();
	console.error(`Danger groups ${dangerEndTime - dangerStartTime}ms`);
	console.error("Danger groups", dangerGroups);

	// * Heroes loop
	for (let i = 0; i < heroesPerPlayer; i++) {
		const heroStartTime = +new Date();
		const hero = heroes[i];

		// TODO Check danger group
		// TODO Multiple options to kill danger spider -> control, push or just kill it

		// TODO Nothing to do -> barycenter to kill spiders
		// TODO No spiders -> move to zone

		let action = move(zones[i]);
		const heroEndTime = +new Date();
		console.log(`MOVE ${action.x} ${action.y} ${heroEndTime - heroStartTime}ms`);
	}

	// * Debug
	const endTime = +new Date();
	console.error(`Total ${endTime - startTime}ms`);
}
