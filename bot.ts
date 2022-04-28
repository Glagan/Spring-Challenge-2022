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
	speed: Position;
	nearBase: boolean;
	threatFor: Threat;
	distance: number;
	willPush: boolean;
	willControl: boolean;
	willShield: boolean;
};

type HeroRanking = [number, number, number];

type CentroidGroup = {
	assigned: boolean;
	entities: Entity[];
	center: Position;
	distances: HeroRanking;
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
	spell: Spell;
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

type AnyAction = WaitAction | MoveAction | PushAction | ShieldAction | ControlAction;

// * Constants

const FOG_BASE = 36000000; // 6000 * 6000
const HERO_VIEW = 4840000; // 2200 * 2200
const WIND_RANGE = 1638400; // 1280 * 1280
const WIND_EXTRACT_RANGE = 7840000; // 2800 * 2800
const WIND_BOMB_RANGE = 51840000; // 7200 * 7200
const CONTROL_RANGE = HERO_VIEW; // 2200 * 2200
const CONTROL_EXTRACT_RANGE = 21160000; // 4600 * 4600
const SHIELD_RANGE = CONTROL_RANGE;
const SHIELD_MOVEMENT_RANGE = 23040000; // 4800 * 4800 (12 * 400)
const CENTROID_RADIUS = 2560000; // 1600 * 1600
const ATTACKING_ENEMY = 64000000; // 8000 * 8000
const BOUNDARY_X = 17630;
const BOUNDARY_Y = 9000;

// * Utilities

function distance(e: Entity | Position, e2: Entity | Position): number {
	// return Math.sqrt((Math.pow(x2 - x, 2)) + (Math.pow(y2 - y, 2)))
	const a = e.x - e2.x;
	const b = e.y - e2.y;
	return a * a + b * b;
}

function distanceUnit(unit: number) {
	return unit * unit;
}

function move(position: Entity | Position): MoveAction {
	return { type: ActionType.MOVE, x: position.x, y: position.y };
}

function control(entity: Entity, position: Position): ControlAction {
	entity.willControl = true;
	return { type: ActionType.SPELL, spell: Spell.CONTROL, entity: entity.id, ...position };
}

function shield(entity: Entity): ShieldAction {
	entity.willShield = true;
	return { type: ActionType.SPELL, spell: Spell.SHIELD, entity: entity.id };
}

function push(entities: Entity[], position: Position): PushAction {
	for (const entity of entities) {
		entity.willPush = true;
	}
	return { type: ActionType.SPELL, spell: Spell.WIND, ...position };
}

// * State

const inputs: string[] = readline().split(" ");
const base: Position = { x: parseInt(inputs[0]), y: parseInt(inputs[1]) }; // The corner of the map representing your base
const baseIsAtZero = base.x === 0;
const enemyBase: Position = { x: baseIsAtZero ? BOUNDARY_X : 0, y: baseIsAtZero ? BOUNDARY_Y : 0 };
const enemyCorners: [Position, Position] = [
	{ x: 400, y: 4500 },
	{ x: 4500, y: 400 },
];
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
} else {
	enemyCorners[0] = { x: enemyBase.x - enemyCorners[0].x, y: enemyBase.y - enemyCorners[0].y };
	enemyCorners[1] = { x: enemyBase.x - enemyCorners[1].x, y: enemyBase.y - enemyCorners[1].y };
}
const shouldBeInZone: HeroRanking = [0, 1, 2];
let enemyCanAttack: boolean = false;
let enemyDoShield: boolean = false;

// * Utilities

// sort(toPosition(position))
function toPosition(position: Position) {
	return function (a: Entity, b: Entity) {
		return distance(position, a) - distance(position, b);
	};
}

// sort(byDistance)
function byDistance(a: Entity, b: Entity) {
	return a.distance - b.distance;
}

// filter(notIn(entities))
function notIn(other: Entity[]) {
	return function (a: Entity) {
		return other.findIndex((b) => b.id === a.id) < 0;
	};
}

// filter(visible(hero))
function visible(hero: Entity) {
	return function (a: Entity) {
		return distance(a, hero) < HERO_VIEW;
	};
}

function inRange(position: Position, range: number) {
	return function (a: Entity) {
		return distance(a, position) < range;
	};
}

function roundsToLeaveMap(start: Position, speed: Position) {
	let rounds = 0;
	const p = { ...start };
	while (p.x > 0 && p.x < BOUNDARY_X && p.y > 0 && p.y < BOUNDARY_Y) {
		p.x += speed.x;
		p.y += speed.y;
		rounds += 1;
	}
	return rounds;
}

function killable(hero: Entity) {
	return function (entity: Entity) {
		const remainingRounds = roundsToLeaveMap(entity, entity.speed);
		// TODO + add roundsToReach(hero)
		const roundsToKill = entity.health / 2;
		return roundsToKill < remainingRounds;
	};
}

function centroid(positions: Position[]): Position {
	const n = positions.length;
	const n1 = 1 / n;
	const position = { x: 0, y: 0 };
	for (let index = 0; index < n; index++) {
		position.x += positions[index].x;
		position.y += positions[index].y;
	}
	position.x = Math.round(n1 * position.x);
	position.y = Math.round(n1 * position.y);
	return position;
}

function biggestCentroids(entities: Entity[]) {
	// Create a group of entities for each entity as a starting point
	// And select the group of groups with the biggest average
	let bestGroupEntities: Entity[][] = [];
	let groupAverage = -1;
	for (const entity of entities) {
		// Start with the current entity
		const entitiesCopy = [
			{ ...entity, used: false },
			...entities.filter((o) => o.id != entity.id).map((s) => ({ ...s, used: false })),
		];
		const currentGroup: Entity[][] = [];

		// Generate groups
		for (const otherEntity of entitiesCopy) {
			if (otherEntity.used) continue;
			const closeEntities = entitiesCopy.filter(
				(other) => !other.used && distance(otherEntity, other) < CENTROID_RADIUS
			);
			if (closeEntities.length > 0) {
				for (const entity of closeEntities) {
					entity.used = true;
				}
				currentGroup.push(closeEntities);
			}
		}

		// Check if it's better than the current one and save it if so
		if (currentGroup.length > 0) {
			const currentWeight =
				currentGroup.reduce((carry, group) => {
					return carry + group.length;
				}, 0) / currentGroup.length;
			if (currentWeight > groupAverage) {
				bestGroupEntities = currentGroup;
			}
		}
	}
	if (bestGroupEntities.length > 0) {
		return bestGroupEntities.map((entities) => {
			return {
				entities,
				center: entities.length > 1 ? centroid(entities) : { x: entities[0].x, y: entities[0].y },
			};
		});
	}
	return undefined;
}

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
			speed: { x: parseInt(inputs[7]), y: parseInt(inputs[8]) }, // Trajectory of this monster
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

	// * Create group of danger spiders that heroes can kill
	// They are calculated on each turns to update automatically and balance heroes if needed
	const dangerStartTime = +new Date();
	let dangerGroups: CentroidGroup[] = [];
	if (dangerSpiders.length > 0) {
		const groups = biggestCentroids(dangerSpiders);
		if (groups) {
			dangerGroups = groups.map((group) => {
				const heroDistances: HeroRanking = [
					distance(heroes[0], group.center),
					distance(heroes[1], group.center),
					distance(heroes[2], group.center),
				];
				return {
					assigned: false,
					...group,
					distances: heroDistances,
					closest: [...heroDistances]
						.sort((a, b) => a - b)
						.map((v) => heroDistances.indexOf(v)) as HeroRanking,
				};
			});
		}
	}
	const dangerEndTime = +new Date();
	console.error(`Danger groups ${dangerEndTime - dangerStartTime}ms`);

	// * Check if there is attacking heroes
	// Silence heroes attacking our base urgently
	const shieldedUltraDanger = dangerSpiders.find((s) => s.shieldLife > 0);
	const controlledHeroes = heroes.filter((h) => h.isControlled);
	let attackingEnemies: Entity[] =
		shieldedUltraDanger || controlledHeroes.length > 0
			? enemies
					.sort(toPosition(base))
					.filter((e) => e.shieldLife === 0 && !e.willShield)
					.filter(inRange(base, ATTACKING_ENEMY))
			: [];
	const underAttack = attackingEnemies.length > 0;

	// * Heroes loop
	const allHeroesStartTime = +new Date();
	for (let i = 0; i < heroesPerPlayer; i++) {
		const heroStartTime = +new Date();
		const hero = heroes[i];
		let action: AnyAction | undefined;

		// * Danger groups
		// TODO Check if an enemy is near the base and casting control on our units or shield on spiders
		let lockedAction = false;
		const unassignedDanger = dangerGroups.filter((g) => !g.assigned);
		if (unassignedDanger.length > 0) {
			const maybeAssignedGroup = unassignedDanger.find((group) => group.closest[0] === i);
			if (maybeAssignedGroup && maybeAssignedGroup.entities.length > 0) {
				maybeAssignedGroup.assigned = true;
				lockedAction = true;
				if (mana >= 10) {
					// TODO **Always** extract to NOT kill inside the base for wild mana ?
					// TODO Check if remainingRounds (time to kill until base) is enough or if a spell *is* needed
					const closestSpider = maybeAssignedGroup.entities.sort(toPosition(base))[0];
					const centerDistance = distance(base, maybeAssignedGroup.center);
					const heroDistance = distance(maybeAssignedGroup.center, hero);
					const controllableSpidersPercentage =
						maybeAssignedGroup.entities.reduce(
							(carry, spider) => carry + (spider.shieldLife > 0 ? 0 : 1),
							0
						) / maybeAssignedGroup.entities.length;
					// Push extract or push to stop
					if (
						heroDistance < WIND_RANGE &&
						(centerDistance <= CONTROL_RANGE || centerDistance >= WIND_EXTRACT_RANGE) &&
						// Check that at least 75% of the spiders can be pushed ?
						controllableSpidersPercentage >= 0.75
					) {
						action = push(maybeAssignedGroup.entities, enemyBase);
					}
					// Control extract or control to stop
					else if (
						heroDistance < CONTROL_RANGE &&
						!closestSpider.isControlled &&
						closestSpider.shieldLife === 0 &&
						!closestSpider.willControl &&
						(centerDistance <= CONTROL_RANGE || centerDistance >= CONTROL_EXTRACT_RANGE)
					) {
						action = control(closestSpider, enemyBase);
					} else {
						action = move(maybeAssignedGroup.center);
					}
				}
				// Move to attack everybody
				else {
					action = move(maybeAssignedGroup.center);
				}
			}
		}

		// * Remove enemies
		if (underAttack && hero.shieldLife == 0) {
			for (const enemy of attackingEnemies) {
				if (distance(hero, enemy) < CONTROL_RANGE) {
					action = shield(hero);
					lockedAction = true;
					break;
				}
			}
		}

		// * Handle transitions
		// Control spiders to send them back to the enemy base
		const visibleSpiders = spiders.filter(visible(hero));
		const pushableSpiders = visibleSpiders.filter(inRange(hero, WIND_RANGE));
		if (!lockedAction && pushableSpiders.length > 3) {
			action = push(pushableSpiders, enemyBase);
			lockedAction = true;
		}

		// * Farm
		const heroCloseSpiders = visibleSpiders.filter((s) => s.threatFor !== Threat.opponent);
		const closeKillable = heroCloseSpiders.filter(killable(hero));
		if (!lockedAction && closeKillable.length > 0) {
			// TODO Select centroid with the largest amount of killable spiders
			const group = biggestCentroids(closeKillable);
			if (group) {
				// Sort groups to focus the biggest one and the closest one
				const biggestGroup = group.sort((a, b) => {
					if (a.entities.length > b.entities.length) return 1;
					if (a.entities.length < b.entities.length) return -1;
					const aDistance = distance(hero, a.center);
					const bDistance = distance(hero, b.center);
					return aDistance - bDistance;
				});
				action = move(biggestGroup[0].center);
			}
		}

		// * Send bombs
		if (!lockedAction && mana > 50) {
			// If there is multiple spiders push them instead of control one by one
			const pushableSpiders = spiders
				.filter(inRange(hero, WIND_RANGE))
				.filter(inRange(enemyBase, WIND_BOMB_RANGE))
				.filter((s) => s.shieldLife === 0 && !s.willPush);
			if (pushableSpiders.length > 1) {
				action = push(pushableSpiders, enemyBase);
			}
			// Else control them to an enemy base corner
			const controllableSpiders = heroCloseSpiders.filter(
				(s) => !s.isControlled && s.shieldLife === 0 && !s.willControl
			);
			if (controllableSpiders.length > 0) {
				const uselessOrDanger = controllableSpiders.filter(
					(spider) =>
						spider.health >= 15 &&
						(spider.threatFor === Threat.self ||
							(spider.threatFor === Threat.none && killable(hero)(spider)))
				);
				// TODO Sort by remainingRounds
				const mostXSpider = uselessOrDanger[0];
				// Control to the closest corner, to avoid sending everything to the front
				if (uselessOrDanger.length > 0) {
					const cornerDistance = [
						distance(mostXSpider, enemyCorners[0]),
						distance(mostXSpider, enemyCorners[1]),
					];
					if (cornerDistance[0] < cornerDistance[1]) {
						action = control(mostXSpider, enemyCorners[0]);
					} else {
						action = control(mostXSpider, enemyCorners[1]);
					}
				}
			}
		}

		// * Shield undefusable bombs
		// TODO Fix filter or something ? Check that it works
		if (!lockedAction && mana > 20) {
			const superBombs = spiders
				.filter(inRange(hero, SHIELD_RANGE))
				.filter((s) => s.shieldLife === 0 && !s.willShield && s.threatFor === Threat.opponent)
				// Checking SHIELD_MOVEMENT_RANGE is equivalent to checking if the unit can't be killed
				.filter(inRange(enemyBase, SHIELD_MOVEMENT_RANGE));
			if (superBombs.length > 0) {
				const bestSuperBomb = superBombs.sort(toPosition(enemyBase))[0];
				action = control(bestSuperBomb, enemyBase);
			}
		}

		// * Execute action
		if (!action) {
			// TODO If close enough to zones[i] move in a random position
			action = move(zones[i]);
		}
		let playAction: string = "";
		if (action.type === ActionType.WAIT) {
			playAction = "WAIT";
		} else if (action.type === ActionType.MOVE) {
			playAction = `MOVE ${action.x} ${action.y}`;
		} else {
			if (action.spell === Spell.WIND) {
				playAction = `SPELL ${action.spell} ${action.x} ${action.y}`;
			} else if (action.spell === Spell.CONTROL) {
				playAction = `SPELL ${action.spell} ${action.entity} ${action.x} ${action.y}`;
			} else {
				playAction = `SPELL ${action.spell} ${action.entity}`;
			}
			mana -= 10;
		}
		const heroEndTime = +new Date();
		console.log(`${playAction} ${heroEndTime - heroStartTime}ms`);
	}
	const allHeroesEndTime = +new Date();
	console.error(`Heroes ${allHeroesEndTime - allHeroesStartTime}ms`);

	// * Debug
	const endTime = +new Date();
	console.error(`Total ${endTime - startTime}ms`);
}
