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

type Status = {
	health: number;
	mana: number;
};

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
	entities: Entity[];
	center: Position;
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

// Unit used to avoid Math.sqrt usage
function distanceUnit(unit: number) {
	return unit * unit;
}

const FOG_BASE = distanceUnit(6000);
const HERO_VIEW = distanceUnit(2200);
const WIND_RANGE = distanceUnit(1280);
const WIND_EXTRACT_RANGE = distanceUnit(2800);
const WIND_BOMB_RANGE = distanceUnit(7200);
const WIND_SHOULD_EXTRACT_RANGE = distanceUnit(4000);
const CONTROL_RANGE = HERO_VIEW;
const CONTROL_EXTRACT_RANGE = distanceUnit(4600);
const SHIELD_RANGE = CONTROL_RANGE;
const SHIELD_MOVEMENT_RANGE = distanceUnit(4800); // 12 * 400
const CENTROID_RADIUS = distanceUnit(1600);
const ATTACKING_ENEMY = distanceUnit(7000);
const ATTACKING_ENEMY_RANGE = distanceUnit(8000);
const SEND_MINIMUM = FOG_BASE;
const ATTACK_POINT_RANGE = distanceUnit(800);
const SPIDER_POINT_RANGE = distanceUnit(400);
const BOUNDARY_X = 17630;
const BOUNDARY_Y = 9000;
const DEFAULT_NO_SWITCH_PROTECTOR = 5;
const DEFAULT_NO_SWITCH_AGENT = 20;
const KEEP_MANA_BEFORE_BOMBS = 60;
const SEND_ATTACk_TRESHOLD = 10;
const DEFAULT_NO_SWITCH_TURNS = 20;
const KEEP_ATTACKING_ROUNDS = 10;
const FARM_UNTIL_MANA = 150;

// * Utilities

function distance(e: Entity | Position, e2: Entity | Position): number {
	// return Math.sqrt((Math.pow(x2 - x, 2)) + (Math.pow(y2 - y, 2)))
	const a = e.x - e2.x;
	const b = e.y - e2.y;
	return a * a + b * b;
}

function move(position: Entity | Position): MoveAction {
	return { type: ActionType.MOVE, x: position.x, y: position.y };
}

const selfControlledSpiders: number[] = [];
function control(entity: Entity, position: Position): ControlAction {
	if (!selfControlledSpiders.includes(entity.id)) {
		selfControlledSpiders.push(entity.id);
	}
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
const mapCorners: [Position, Position] = [
	{ x: BOUNDARY_X, y: 0 },
	{ x: 0, y: BOUNDARY_Y },
];
const heroesPerPlayer: number = parseInt(readline()); // Always 3
const farmZones: [Position, Position, Position] = [
	{ x: 2300, y: 6500 },
	// { x: 11000, y: 8000 },
	{ x: 7300, y: 6500 },
	{ x: 10000, y: 2200 },
];
const enemyCorners: {
	stack: [Position, Position];
	control: [Position, Position];
} = {
	stack: [
		{ x: 5500, y: 500 },
		{ x: 500, y: 5500 },
	],
	control: [
		{ x: 400, y: 4500 },
		{ x: 4500, y: 400 },
	],
};
const protectorPatrol: Position[] = [
	{ x: 1000, y: 5000 },
	{ x: 3500, y: 3600 },
	{ x: 5000, y: 1000 },
];
let currentPatrolZone = 1;
let attack = false;
let didNotMoveFor = 0;
let useCorner = 0;

// * Reverse position

function reversePosition(position: Position): Position {
	return { x: BOUNDARY_X - position.x, y: BOUNDARY_Y - position.y };
}

function reversePositionArray(positions: Position[]): void {
	for (let index = 0; index < positions.length; index++) {
		positions[index] = reversePosition(positions[index]);
	}
}

if (!baseIsAtZero) {
	reversePositionArray(farmZones);
	reversePositionArray(protectorPatrol);
} else {
	reversePositionArray(enemyCorners.stack);
	reversePositionArray(enemyCorners.control);
}

// * Global flags to enable features

let enemyCanAttack: boolean = false;
let enemyCastInAttack = false;
let enemyDoShield: boolean = false;
let controlledWhileAttacking: [boolean, boolean, boolean] = [false, false, false];

// * Utilities

// sort(toPosition(position))
function byDistanceToPosition(position: Position) {
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

// filter(inRange(position, distance))
function inRange(position: Position, range: number) {
	return function (a: Entity) {
		return distance(a, position) <= range;
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

function closestPatrol(hero: Entity) {
	const distances = [
		distance(hero, protectorPatrol[0]),
		distance(hero, protectorPatrol[1]),
		distance(hero, protectorPatrol[2]),
	];
	if (distances[0] < distances[1]) {
		if (distances[0] < distances[2]) {
			return 0;
		}
		return 2;
	} else if (distances[1] < distances[2]) {
		return 1;
	}
	return 2;
}

function executeAction(action: AnyAction): boolean {
	let playAction: string = "";
	if (action.type === ActionType.WAIT) {
		playAction = "WAIT Huh?";
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
	}
	console.log(playAction);
	return action.type === ActionType.SPELL;
}

// * Game loop

while (true) {
	// * Current state
	const selfStatusStr = readline().split(" ");
	const selfStatus: Status = { health: parseInt(selfStatusStr[0]), mana: parseInt(selfStatusStr[1]) };
	const enemyStatusStr = readline().split(" ");
	const enemyStatus: Status = { health: parseInt(enemyStatusStr[0]), mana: parseInt(enemyStatusStr[1]) };

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
	const dangerSpiders = spiders.filter((spider) => spider.distance <= FOG_BASE).sort(byDistance);

	// * Create group of spiders inside our base that our protector can kill
	let dangerGroups: CentroidGroup[] = [];
	if (dangerSpiders.length > 0) {
		const groups = biggestCentroids(dangerSpiders);
		if (groups) dangerGroups = groups.sort((a, b) => distance(base, a.center) - distance(base, b.center));
	}

	// * Check if there is attacking heroes
	const shieldedUltraDanger = dangerSpiders.find((s) => s.shieldLife > 0);
	const enemiesInBase = enemies.filter(inRange(base, ATTACKING_ENEMY));
	const controlledHeroes = heroes.filter((h) => h.isControlled);
	let attackingEnemies: Entity[] =
		shieldedUltraDanger || controlledHeroes.length > 0 || enemiesInBase.length > 0
			? enemiesInBase.sort(byDistanceToPosition(base))
			: [];
	const underAttack = attackingEnemies.length > 0;
	if (!enemyCastInAttack) {
		enemyCastInAttack =
			heroes.filter(inRange(base, ATTACKING_ENEMY)).filter((h) => h.isControlled).length > 0 ||
			dangerSpiders.filter((s) => s.shieldLife > 0 || (s.isControlled && selfControlledSpiders.indexOf(s.id) < 0))
				.length > 0;
	}

	// * Heroes loop
	let otherHeroIsAttacking: Entity[] | undefined;
	const actions: AnyAction[] = [];
	for (const i of [0, 2, 1]) {
		const hero = heroes[i];
		const visibleSpiders = spiders.filter(visible(hero));
		const heroCloseSpiders = visibleSpiders.filter((s) => s.threatFor !== Threat.opponent);
		let action: AnyAction | undefined;
		if (hero.isControlled) {
			controlledWhileAttacking[i] = true;
		}

		// * Protector
		if (i === 0) {
			// * Danger groups
			if (dangerGroups.length > 0) {
				const mostDangerous = dangerGroups[0];
				if ((attack && selfStatus.mana >= 10) || (!attack && selfStatus.mana >= 100)) {
					// Always extract to redirect spiders
					const closestSpider = mostDangerous.entities.sort(byDistanceToPosition(base))[0];
					const centerDistance = distance(base, mostDangerous.center);
					const heroDistance = distance(mostDangerous.center, hero);
					const controllableSpidersPercentage =
						mostDangerous.entities.reduce((carry, spider) => carry + (spider.shieldLife > 0 ? 0 : 1), 0) /
						mostDangerous.entities.length;
					const averageGroupHealth =
						mostDangerous.entities.reduce((carry, spider) => carry + spider.health, 0) /
						mostDangerous.entities.length;
					// Push extract or push to stop
					if (
						heroDistance < WIND_RANGE &&
						(centerDistance <= CONTROL_RANGE ||
							(centerDistance >= WIND_SHOULD_EXTRACT_RANGE && averageGroupHealth > 8)) &&
						// Check that at least 75% of the spiders can be pushed ?
						controllableSpidersPercentage >= 0.75
					) {
						action = push(mostDangerous.entities, enemyBase);
					}
					// Control extract or control to stop
					else if (
						heroDistance < CONTROL_RANGE &&
						closestSpider.threatFor === Threat.self &&
						closestSpider.health > 10 &&
						!closestSpider.isControlled &&
						closestSpider.shieldLife === 0 &&
						!closestSpider.willControl &&
						(centerDistance <= CONTROL_RANGE || centerDistance >= CONTROL_EXTRACT_RANGE)
					) {
						action = control(closestSpider, enemyBase);
					} else {
						action = move(mostDangerous.center);
					}
				}
				// Move to attack everybody
				else {
					action = move(mostDangerous.center);
				}
			}

			// * Handle enemies
			if ((attack && selfStatus.mana >= 10) || (!attack && selfStatus.mana >= 100)) {
				if (underAttack && distance(hero, base) <= ATTACKING_ENEMY_RANGE) {
					if (enemyCastInAttack && hero.shieldLife == 0) {
						for (const enemy of attackingEnemies) {
							if (distance(hero, enemy) < CONTROL_RANGE) {
								action = shield(hero);
								break;
							}
						}
					} else if (attackingEnemies.length > 0) {
						for (const enemy of attackingEnemies) {
							const canBeMoved = enemy.shieldLife === 0 && !enemy.isControlled && !enemy.willControl;
							if (!canBeMoved) continue;
							if (distance(hero, enemy) <= WIND_RANGE) {
								action = push([enemy], enemyBase);
								attackingEnemies = attackingEnemies.filter((e) => e.id === enemy.id);
								break;
							} else if (distance(hero, enemy) <= WIND_RANGE) {
								action = control(enemy, enemyBase);
								attackingEnemies = attackingEnemies.filter((e) => e.id === enemy.id);
								break;
							}
						}
					}
				} else {
					const visibleEnemies = enemies
						.filter(inRange(hero, HERO_VIEW))
						.filter((enemy) => enemy.shieldLife === 0 && !enemy.isControlled && !enemy.willControl)
						.sort(byDistance);
					if (visibleEnemies.length > 0) {
						const closestCorner =
							distance(visibleEnemies[0], mapCorners[0]) < distance(visibleEnemies[0], mapCorners[1])
								? 1
								: 0;
						action = control(visibleEnemies[0], mapCorners[closestCorner]);
					}
				}
			}

			// * Farm
			const closeKillable = heroCloseSpiders; // .filter(killable(hero));
			if (!action && closeKillable.length > 0) {
				const groups = biggestCentroids(closeKillable)?.filter(
					(g) => distance(g.center, base) <= WIND_BOMB_RANGE
				);
				if (groups && groups.length > 0) {
					// Sort groups to focus the biggest one and the closest one
					const biggestGroup = groups.sort((a, b) => {
						const aOnlyKillable = a.entities.filter(killable(hero));
						const bOnlyKillable = b.entities.filter(killable(hero));
						if (aOnlyKillable.length > bOnlyKillable.length) return 1;
						if (aOnlyKillable.length < bOnlyKillable.length) return -1;
						const aDistance = distance(hero, a.center);
						const bDistance = distance(hero, b.center);
						return aDistance - bDistance;
					});
					action = move(biggestGroup[0].center);
				}
			}

			// * Send spiders for the future
			if (selfStatus.mana > 100) {
				// Control them to an enemy base corner
				const controllableSpiders = heroCloseSpiders.filter(
					(s) => !s.isControlled && s.shieldLife === 0 && !s.willControl
				);
				if (controllableSpiders.length > 0) {
					const uselessOrDanger = controllableSpiders.filter(
						(spider) => spider.health >= 15 && spider.threatFor === Threat.self
					);
					const mostXSpider = uselessOrDanger[0];
					// Control to the closest corner, to avoid sending everything to the front
					if (uselessOrDanger.length > 0) {
						const cornerDistance = [
							distance(mostXSpider, enemyCorners.control[0]),
							distance(mostXSpider, enemyCorners.control[1]),
						];
						if (cornerDistance[0] < cornerDistance[1]) {
							action = control(mostXSpider, enemyCorners.control[0]);
						} else {
							action = control(mostXSpider, enemyCorners.control[1]);
						}
					}
				}
			}

			// * Default action
			if (!action) {
				if (attack) {
					// Resume patrol to the closest patrol point
					if (currentPatrolZone === -1) {
						currentPatrolZone = 1;
						// let patrolPoint = closestPatrol(hero);
					}
					// TODO Check if there is any enemy and patrol to the closest patrol point of the enemy
					if (distance(hero, protectorPatrol[currentPatrolZone]) < SPIDER_POINT_RANGE) {
						currentPatrolZone = (currentPatrolZone + 1) % 3;
					}
					action = move(protectorPatrol[currentPatrolZone]);
				} else {
					action = move(farmZones[i]);
				}
			} else {
				currentPatrolZone = -1;
			}
		}

		// * Agent
		if (i !== 0) {
			if (attack) {
				// * Send spiders for the future
				if (selfStatus.mana > FARM_UNTIL_MANA - 50) {
					// If there is multiple spiders push them instead of control one by one
					const pushableSpiders = spiders
						.filter(inRange(hero, WIND_RANGE))
						.filter(inRange(enemyBase, SEND_MINIMUM))
						.filter((s) => s.shieldLife === 0);
					if (pushableSpiders.length > 1) {
						action = push(pushableSpiders, enemyBase);
					}
					// Else control them to an enemy base corner
					else {
						const controllableSpiders = heroCloseSpiders.filter(
							(s) => !s.isControlled && s.shieldLife === 0 && !s.willControl
						);
						if (controllableSpiders.length > 0) {
							const uselessOrDanger = controllableSpiders
								.filter(
									(spider) =>
										spider.health >= 15 &&
										(spider.threatFor === Threat.self ||
											(spider.threatFor === Threat.none && !killable(hero)(spider)))
								)
								.sort((a, b) => roundsToLeaveMap(a, a.speed) - roundsToLeaveMap(b, b.speed));
							const mostXSpider = uselessOrDanger[0];
							// Control to the closest corner, to avoid sending everything to the front
							if (uselessOrDanger.length > 0) {
								const cornerDistance = [
									distance(mostXSpider, enemyCorners.control[0]),
									distance(mostXSpider, enemyCorners.control[1]),
								];
								if (cornerDistance[0] < cornerDistance[1]) {
									action = control(mostXSpider, enemyCorners.control[0]);
								} else {
									action = control(mostXSpider, enemyCorners.control[1]);
								}
								action = control(mostXSpider, enemyCorners.control[1]);
							}
						}
					}
				}

				// TODO Prepare CANNON
				const preparableSpiders = visibleSpiders.filter(
					(s) => s.threatFor != Threat.opponent && !s.isControlled && !s.willControl && s.shieldLife === 0
				);
				if (preparableSpiders.length > 0) {
					action = control(preparableSpiders[0], enemyBase);
				}

				// TODO CANNON
				const cannonSpiders = visibleSpiders
					.filter(inRange(enemyBase, WIND_BOMB_RANGE))
					.filter(inRange(hero, WIND_RANGE))
					.filter((s) => s.threatFor === Threat.opponent);
				// console.error(cannonSpiders);
				if (cannonSpiders.length > 0) {
					action = push(cannonSpiders, enemyBase);
				}
				// * Shield undefusable bombs
				else if (selfStatus.mana > 20) {
					const superBombs = visibleSpiders
						.filter(
							(s) =>
								s.shieldLife === 0 && !s.willShield && s.health > 15 && s.threatFor === Threat.opponent
						)
						// Checking SHIELD_MOVEMENT_RANGE is equivalent to checking if the unit can't be killed
						// .filter(inRange(enemyBase, SHIELD_MOVEMENT_RANGE));
						.filter(inRange(enemyBase, SEND_MINIMUM));
					if (superBombs.length > 0) {
						const bestSuperBomb = superBombs.sort(byDistanceToPosition(enemyBase))[0];
						action = shield(bestSuperBomb);
					}
				}

				if (controlledWhileAttacking[i] && hero.shieldLife === 0) {
					action = shield(hero);
				}

				// TODO Default action
				if (!action) {
					// TODO Control spiders to a position where it can be pushed later
					if (distance(hero, enemyCorners.stack[useCorner]) < 1000) {
						didNotMoveFor += 1;
					} else {
						didNotMoveFor = 0;
					}
					if (didNotMoveFor > 5) {
						useCorner = (useCorner + 1) % 2;
					}
					action = move(enemyCorners.stack[useCorner]);
				}
			} else {
				// * Farm
				// -- stay near of the original farm zone to control entries
				const closeKillable = heroCloseSpiders; // .filter(killable(hero));
				if (closeKillable.length > 0) {
					const groups = biggestCentroids(closeKillable)?.filter(
						(g) => distance(farmZones[i], g.center) <= HERO_VIEW
					);
					if (groups && groups.length > 0) {
						// Sort groups to focus the biggest one and the closest one
						const biggestGroup = groups.sort((a, b) => {
							const aOnlyKillable = a.entities.filter(killable(hero));
							const bOnlyKillable = b.entities.filter(killable(hero));
							if (aOnlyKillable.length > bOnlyKillable.length) return 1;
							if (aOnlyKillable.length < bOnlyKillable.length) return -1;
							const aDistance = distance(hero, a.center);
							const bDistance = distance(hero, b.center);
							return aDistance - bDistance;
						});
						action = move(biggestGroup[0].center);
					}
				}

				// * Send spiders for the future
				if (selfStatus.mana > 100) {
					// Control them to an enemy base corner
					const controllableSpiders = heroCloseSpiders.filter(
						(s) => !s.isControlled && s.shieldLife === 0 && !s.willControl
					);
					if (controllableSpiders.length > 0) {
						const uselessOrDanger = controllableSpiders.filter(
							(spider) => spider.health >= 15 && spider.threatFor === Threat.self
						);
						const mostXSpider = uselessOrDanger[0];
						// Control to the closest corner, to avoid sending everything to the front
						if (uselessOrDanger.length > 0) {
							const cornerDistance = [
								distance(mostXSpider, enemyCorners.control[0]),
								distance(mostXSpider, enemyCorners.control[1]),
							];
							if (cornerDistance[0] < cornerDistance[1]) {
								action = control(mostXSpider, enemyCorners.control[0]);
							} else {
								action = control(mostXSpider, enemyCorners.control[1]);
							}
						}
					}
				}

				// * Default action
				if (!action) {
					action = move(farmZones[i]);
				}
			}
		}

		actions.push(action!);
	}

	// * Execute actions
	if (attack || selfStatus.mana >= FARM_UNTIL_MANA) attack = true;
	for (const i of [0, 2, 1]) {
		const castedSpell = executeAction(actions[i]);
		if (castedSpell) selfStatus.mana -= 10;
	}
}
