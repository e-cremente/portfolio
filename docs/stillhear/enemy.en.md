# Enemy: AI, skills & animation

The **worm** is one of *Still Hear*'s main enemies, and I built it end to end: AI behaviour, skills, animation and control rig. It's a **blind** creature that hunts the player *by listening to vibrations through the ground*: the moment it picks up a noise it locks onto you, chases you and attacks with a ballistic dive; disturb it with a lure and it turns toward that sound.

The work happened on two layers, as with the rest of the game. First I built the **shared enemy foundation** — the base pawn class, the base AI controller class with its state model, and a toolkit of reusable Behavior Tree nodes. Then, on that foundation, I built the **worm entirely**: its hearing-based perception, its two abilities, its procedural animation and its navmesh recovery.

> A second enemy lives on the same shared base: the **mantis** (a *sighted* predator, with a vision-cone perception system). The mantis is a colleague's work and I only name it here: this page documents the base and the worm.

---

## Overview

The AI is layered, from most generic to most specific:

| Layer | Class / element | Responsibility |
|---|---|---|
| **Base pawn** | `AStillHearAICharacterBase` | The base of every enemy: owns the ASC (inherits from [`AStillHearCharacterBase`](doc.html?p=stillhear&doc=gas)), handles speed, waypoints, stun, reset and the hit reaction. |
| **Base controller** | `AStillHearAIControllerBase` | The base of every AI brain: perception, team membership, and the **state model** (Unaware → Suspicious → Alerted/Hunting). |
| **Data asset** | `UAIInfo_DataAssetBase` (+ children) | Every tunable number (speeds, durations, hearing ranges…) lives here, never in code. |
| **BT toolkit** | Generic tasks / services / decorators | Patrolling, movement, gait switching, navmesh recovery: nodes reusable by any enemy. |
| **Worm** | `AAIWormCharacter`, `AAIWormController`, `UWormAnimInstance`, abilities, nav link | The complete enemy, built on everything above. |

The underlying principle is the same as the rest of the project: **behaviour flows through tags and the blackboard**, and values are data-driven. An enemy doesn't hard-wire numbers: it reads its data asset. One piece of code doesn't ask another "what state are you in?": it reads a tag or a blackboard key.

---

## The state model (shared base)

The base controller defines a set of awareness states — represented together as a **gameplay tag** on the ASC, a blackboard key, and an event for the UI. The **worm, though, uses only a subset**: it's a direct, almost *dumb* enemy. It doesn't investigate and doesn't really search for you — the moment it senses you (by hearing or by touch) it snaps straight to **Alerted**, and stays there until a cooldown timer brings it back to **Unaware**.

```
       hears a noise / contact
 UNAWARE ────────────────────► ALERTED
    ▲                             │
    └────── cooldown timer ───────┘

 STUNNED — cross-cutting state: freezes the logic while it lasts
```

`UpdateCurrentStatusTag` centralizes the transitions: it updates the current tag, writes it into the blackboard (`CurrentStatusTag`) and broadcasts it via `OnStatusTagChanged` — so the indicator above the enemy and the rest of the UI react without polling anything.

```cpp
// StillHearAIControllerBase.cpp — UpdateCurrentStatusTag (condensed)
case E_AITag::ALERTED:
    CurrentStatusTag = TAG_Status_EnemyAI_Alerted;
    GetNPCRef()->GetAbilitySystemComponent()->AddLooseGameplayTag(TAG_Status_EnemyAI_Alerted);
    break;
// …
if (IsValid(Blackboard))
    Blackboard->SetValueAsName(BlackboardKeyNames::KeyNameCurrentStatusTag, CurrentStatusTag.GetTagName());

OnStatusTagChanged.Broadcast(CurrentStatusTag);
```

The base controller also defines **team membership** (`GetTeamAttitudeTowards`): enemies are team 1, the player is hostile, team 255 is neutral. And it owns the **perception hook** (`PerceptionEventReceived`) as a virtual method each concrete enemy overrides — because the worm *hears*, the mantis *sees*, but both start from the same scaffolding.

> **The base carries more than the worm uses.** The same model includes intermediate states — **Suspicious** and **Hunting** — meant for an enemy that *investigates* before attacking, gradually filling a vision-cone awareness meter. That richer flow belongs to the **mantis** (sighted, a colleague's work); the worm ignores it on purpose, to stay a simple, immediate threat.

---

## The worm, in detail

### A hunter that feels the ground

The worm mounts a `UAIPerceptionComponent` with the **Hearing** sense, but the sense's "raw" range is only the first filter. The real logic is in the controller: when a hearing stimulus arrives, it checks **the noise type** and compares it against the **per-type range** taken from the data asset.

```cpp
// AIWormController.cpp — PerceptionEventReceived (condensed)
float StimulusDistance = (GetNPCRef()->GetActorLocation() - Stimulus.StimulusLocation).Size();

if ((Stimulus.Tag.ToString().Contains("Walk")   && StimulusDistance <= NPCWormDataAsset->WalkHearingRange)
 || (Stimulus.Tag.ToString().Contains("Run")    && StimulusDistance <= NPCWormDataAsset->RunHearingRange)
 || (Stimulus.Tag.ToString().Contains("Crouch") && StimulusDistance <= NPCWormDataAsset->CrouchHearingRange))
{
    UpdateCurrentStatusTag(E_AITag::ALERTED);
    WormAnimInstance->SetIsAlerted(true);
    UpdateTargetLocation(Stimulus.StimulusLocation);
    UpdateTargetActor(UpdatedActor);
}
```

Each noise type has its own range, with these default values in the worm's data asset:

| Player gait | Hearing range (default) | In the model |
|---|---|---|
| Running | `750` uu | The widest hearing threshold. |
| Walking | `250` uu | In between. |
| Crouched | `80` uu | The smallest among the defaults. |
| Bell (lure) | up to `MaxHearingRange` | A deliberate bait: draws the worm in, with a longer cooldown. |

> **How it feels in game.** Those above are the *mechanism* and its default values. In the final tuning, though, the designers pushed the worm toward the aggressive extreme: in practice, producing any vibration is enough for it to spot you from nearly anywhere. The per-noise-type system stays the lever that *could* make it more forgiving — in the shipped game, deliberately, it isn't.

When it detects something, the worm becomes **Alerted**, stores the sound's location and starts a **cooldown timer**: if it hears nothing more, it returns to **Unaware** after `AlertCooldownTimer` seconds (or `BellCooldownTimer`, longer, if the last stimulus was the bell). It also has a second sense — **Touch**: the head, body and tail colliders report contact, and a hit from the **head kills the player** by applying a death gameplay effect.

### Serpentine movement and control rig

The worm doesn't rotate like a humanoid character: its head continuously chases a point — `LookAtPos` — that leads its velocity by 150 units, and the rest of the body follows. This produces the characteristic sinuous motion without hand-made animation.

```cpp
// AIWormCharacter.cpp — AdjustCapsuleRotation (condensed)
const FVector Direction = GetVelocity().GetSafeNormal();
LookAtPos->SetWorldLocation(GetActorLocation() + Direction * 150.f);

FRotator NewRotation = UKismetMathLibrary::FindLookAtRotation(GetActorLocation(), LookAtPos->GetComponentLocation());
NewRotation.Pitch = -NewRotation.Pitch;
HeadCollider->SetWorldRotation(InitialCapsuleRotation + NewRotation);
```

The worm's anim instance (`UWormAnimInstance`) is deliberately **thin**: each frame it only reads `LookAtPos` from the pawn and passes it to the **control rig**, which bends the head-body-tail mesh toward that point. Everything else is boolean flags the controller raises/lowers based on state — `bIsWalking`, `bIsRunning`, `bIsRoaring`, `bIsDiving`, `bIsAlerted` — which the anim graph uses to pick poses.

```cpp
// WormAnimInstance.cpp — NativeUpdateAnimation
if (IsValid(Worm))
    LookAtPos = Worm->GetLookAtPosLocation();   // the control rig reads this value
```

Two finishing details live in the worm's pawn/controller:

- **Ground debris.** While it slithers on the ground, the controller activates the `GameplayCue.GroundDebris` cue (dust/debris); it removes it while the worm is airborne during the dive.
- **Separation from its own kind.** If several worms get close, each applies a small separation force (*boids*-style) to avoid interpenetrating, collecting neighbours through its own colliders' overlaps.

### The worm's abilities

Both of the worm's abilities are *gameplay abilities* built on the game's [GAS foundation](doc.html?p=stillhear&doc=gas): they declare their own asset tag, end themselves via ability tasks, and clean up in `EndAbility`.

**Roar (`GA_WormRoar`).** Switches to `MOVE_Flying`, plays the roar montage and waits for an AnimNotify (`Event.EnemyAI.WormRoar`) that, on the right frame, applies the roar's area effect. It marks `HasRoared` in the blackboard and restores walking on exit.

**Dolphin dive (`GA_WormDolphinDive`).** This is the attack. It isn't triggered by a timer, but by **navigation itself**: when the worm's path crosses an `ANavLink_WormDive` (a gap it can't cross on foot), the *smart link* fires, sets the destination as the target and activates the ability.

```cpp
// NavLink_WormDive.cpp — when the worm reaches the link
Controller->SetCurrentTargetLocation(DestinationPoint);
Asc->TryActivateAbilityByClass(WormDolphinDiveAbilityClass);
```

The ability computes a **ballistic arc** toward the target, launches the worm and waits for the landing (return to `MOVE_Walking`) to end. If the worm is **stunned** mid-air, the ability cancels; the cooldown is committed on activation:

```cpp
// GA_WormDolphinDive.cpp — ActivateAbility (condensed)
bool bArcFound = UGameplayStatics::SuggestProjectileVelocity_CustomArc(
    GetWorld(), LaunchVelocity, Worm->GetActorLocation(), Target + FVector(0,0,100));
if (!bArcFound) { EndAbility(..., /*bWasCancelled*/ true); return; }

WormAnimInstance->SetIsDiving(true);
Worm->LaunchCharacter(LaunchVelocity, true, true);

// ends on landing; cancels if the stun arrives
ASC->RegisterGameplayTagEvent(TAG_Status_EnemyAI_Stunned, ...).AddUObject(this, &ThisClass::OnStunTagAdded);
CommitAbilityCooldown(Handle, ActorInfo, ActivationInfo, true);
```

The ability is tagged both as `GameplayAbility.EnemyAI.DolphinDive` and as the generic `GameplayAbility.EnemyAI.Attack`, so other systems (feedback, status UI) can react to the simple idea of "the enemy is attacking".

---

## The worm's Behavior Tree

The worm's behaviour is a Behavior Tree split into three pieces: a **main tree** that decides *what* it's doing right now, and two sub-trees — **patrol** and **chase** — for the two big modes. It's all assembled from the nodes I wrote for the job (many of them generic and reusable by other enemies).

### The main tree — what the worm is doing

![Main tree of the worm's Behavior Tree](Images/stillhear/worm_bt_main.png)

Under the root sits a **Selector** guarded by the **Check NavMesh and Cache Position** service, which every frame keeps the "am I on the navmesh?" info fresh. The selector's branches, in priority order (from the left):

1. **Stunned → still.** If `CurrentStatusTag == Status.EnemyAI.Stunned`, a `FinishWithResult (InProgress)` holds the worm motionless for the whole stun. The decorator *aborts both*: whatever it was doing gets interrupted.
2. **Off navmesh → return.** If the `Should Worm Return To NavMesh` decorator is true, it runs **Return to NavMesh**.
3. **Alerted → chase.** If `CurrentStatusTag != Status.EnemyAI.Unaware` (i.e. it sensed something), it runs the **BT_WormChase** sub-tree.
4. **Otherwise → patrol.** The resting branch: it runs **BT_WormPatrol**.

The order isn't accidental: stun and navmesh recovery sit *above* chase and patrol on purpose — a stunned or displaced worm has to resolve that before anything else.

**Navmesh recovery isn't an extra: it's necessary.** The dive launches the worm on a physics arc that can land it *off* the navmesh; without recovery, it would be stuck. Branch 2's service constantly checks the navmesh projection and, when needed, caches the nearest safe point by searching expanding rings (excluding the one right under the worm):

```cpp
// BTService_CheckNavMeshAndCachePosition.cpp — expanding-ring search (condensed)
for (const float Extent : {100.f, 200.f, 400.f, 800.f, 1500.f})
{
    if (NavSys->ProjectPointToNavigation(PawnLocation, ProjectedLocation, FVector(Extent, Extent, Extent))
        && !IsProjectedPointUnderPawn(PawnLocation, ProjectedLocation.Location))
        break;   // found a useful safe point (not just underneath the worm)
    // …then retry, shifting the query along ±X and ±Y
}
```

### Patrol — the resting loop

![The worm's patrol sub-tree](Images/stillhear/worm_bt_patrol.png)

While unaware, the worm patrols. A **Change Speed Type** service (runs once, never ticks) sets the walk gait. Then, guarded by the `Is Waypoint Set?` decorator, a **Sequence**: **Move To Waypoint** (toward `CurrentWaypoint`) → **Wait for Waypoint Time** (waits the waypoint's `WaypointWaitTime`) → **Set Next Waypoint** (advances to the next). Designers author the loop by chaining `Waypoint` actors.

### Chase — when it senses the player

![The worm's chase sub-tree](Images/stillhear/worm_bt_chase.png)

The moment the worm becomes alerted, `BT_WormChase` runs. Read top to bottom:

- **Roar, just once.** If `HasRoared` isn't set yet, it runs **Roar** — an `ActivateAbilityAndWait` that activates `GA_WormRoar`. An entrance roar, a single hit.
- Then a **Selector** (with the **Change Speed Type** service, which here raises the gait to run) picks between three behaviours, by priority:
  - **Did the bell ring?** (`WasBellPlayed` set) → the worm has been *fooled*: a **Run EQS Query** (`EQS_PointNearTarget`) finds a point near the sound, it moves there (**Move To**) and stays until it has a real target (`TargetActor` unset → `FinishWithResult InProgress`).
  - **Close enough to dive?** (`IsCloseEnoughToTarget` set) → it verifies a path to the target exists (**Does path exist**, hierarchical query) and then runs the **Dolphin Dive** (`ActivateAbilityAndWait` on `GA_WormDolphinDive`).
  - **Did it hear a sound?** (`TargetActor` set) → **Move To** the target, with the **Check Distance From Actor** service that every frame checks whether the worm has entered dive range — and if so raises `IsCloseEnoughToTarget`, unlocking the dive branch above.

In short, the chase is a priority machine: it roars first; then, if fooled by the bell it chases the bait, if it's in range it dives, otherwise it chases the target until it's close enough to dive.

### The reusable building blocks

Many of the nodes above are **generic**: they only read/write the blackboard and the base classes, so any enemy reuses them. I wrote them as a toolkit — `BTTask_SetNextWaypoint`, `BTTask_MoveToLocation`, the `ChangeSpeedType` service, the navmesh-recovery trio (`BTService_CheckNavMeshAndCachePosition`, `BTD_ShouldWormReturnToNavMesh`, `BTTask_ReturnToNavMesh`), the distance services `CheckDistanceFromActor`/`CheckDistanceFromTarget`, and `BTTask_ActivateAbilityAndWait` that bridges the BT to GAS. All blackboard keys are gathered in one place (`BlackboardKeyNames`), so there are no stray strings scattered through the code and the names never fall out of sync between C++ and assets.

---

## Death and world reset

Enemies hook into the global world reset (`OnRequestWorldReset` on the game instance). When the world resets, the worm cancels every ongoing ability, restores air control, returns to its initial transform and clears its AI state and starting waypoint — so no leftover state bleeds into the next attempt.

```cpp
// StillHearAICharacterBase.cpp — ResetAfterDeath (condensed)
AbilitySystemComponent->CancelAllAbilities();
MoveComp->StopMovementImmediately();
SetActorLocationAndRotation(OriginalLocation, OriginalRotation, false, nullptr, ETeleportType::TeleportPhysics);
AICRef->ResetAIState();
AICRef->GetBlackboardComponent()->SetValueAsObject(BlackboardKeyNames::KeyNameCurrentWaypoint, StartingWaypoint);
```

---

## Designer guide

Almost all of the worm's behaviour is tuned without touching code:

1. **The worm's data asset (`UAIWormInfo_DataAsset`).** This holds the hearing ranges (`Walk`/`Run`/`Crouch`), the cooldown timers (alert and bell), the min/max dive distances and the `Walk`/`Run` gaits.
2. **Patrolling.** Place `Waypoint`s in the level and chain them in sequence; assign the `StartingWaypoint` on the worm. The wait time at each waypoint is a property of the waypoint.
3. **Dive points.** Where the worm should cross a gap with a dive, place an `ANavLink_WormDive`: its smart link fires the attack when the worm traverses it.
4. **Hearing debug.** Enable `ShowDebugCircles` on the data asset to see the hearing-range circles on screen (with configurable colours) while you tune the values.

**Quick checklist**

| Goal | Where to act |
|---|---|
| Worm hears too much/too little | `Walk`/`Run`/`Crouch` ranges in the data asset |
| It stays alerted too long | `AlertCooldownTimer` / `BellCooldownTimer` |
| Change the dive reach | `Min`/`MaxDolphinDiveDistance` |
| Define the patrol loop | Chain of `Waypoint`s + `StartingWaypoint` |
| Add a dive point | Place an `ANavLink_WormDive` |

---

## Programmer guide — a new enemy on the base

The base is designed to be subclassed. For a new enemy:

1. **Subclass the pawn** (`AStillHearAICharacterBase`) and the **controller** (`AStillHearAIControllerBase`).
2. **Configure the senses** by overriding `SetupSightInfo()` and/or `SetupHearingInfo()`: they read from the data asset and configure the `UAIPerceptionComponent`, so designers never touch the controller.
3. **React to perception** by overriding `PerceptionEventReceived`, translating stimuli into state transitions (`UpdateCurrentStatusTag`) and blackboard keys.
4. **Give it a data asset** (a child of `UAIInfo_DataAssetBase`) for all the numbers.
5. **Build the Behavior Tree** from the toolkit's generic nodes, adding only the specific nodes you need.
6. **Abilities** (attacks, etc.) are gameplay abilities like any other — see the [Gameplay Ability System](doc.html?p=stillhear&doc=gas) page: declare the tags, activate with `TryActivateAbilityByClass`, clean up in `EndAbility`.

### Extension points at a glance

| If you want to… | Do this |
|---|---|
| An enemy with a different sense | Override `SetupSightInfo`/`SetupHearingInfo` + `PerceptionEventReceived`. |
| Switch gait from the BT | The `ChangeSpeedType` service with the desired speed type. |
| A navigation-driven ranged attack | A nav link that activates an ability (like `ANavLink_WormDive`). |
| Make an enemy recoverable after a launch | Add the navmesh branch (service + decorator + return task). |
| React to the enemy's state in the UI | Listen to `OnStatusTagChanged` or read the `CurrentStatusTag` key. |

---

## Traps and notes

- **The dive can fling the worm off the navmesh.** The recovery branch (check service + decorator + return task) isn't optional: without it, landing off the navmesh strands the enemy. The decorator deliberately excludes the "still diving" case.
- **The worm's head is lethal on contact.** Only the head collider applies the death effect to the player; body and tail serve touch perception and separation. If you move/rescale the colliders, keep this division of roles in mind.
- **The worm is blind by design.** Don't mount a Sight sense on the worm: the whole design (and the player's readability) rests on the noise/range trade-off. The vision-cone flow belongs to the sighted enemy (mantis), not the worm.
- **Animation depends on the control rig, not on locomotion montages.** The slithering comes from the `LookAtPos` driving the control rig; the anim instance is intentionally minimal. If you change the head-body-tail chain, update the rig, not the anim instance.
- **Grant the enemy's abilities exactly once.** The same guard as the character base applies: AI controllers can re-possess the pawn, and without protection the abilities would be granted twice (see the [GAS](doc.html?p=stillhear&doc=gas) page).
