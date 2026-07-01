# Nemico: IA, abilità e animazione

Il **verme** è uno dei nemici principali di *Still Hear*, e l'ho costruito dall'inizio alla fine: comportamento IA, abilità, animazione e control rig. È una creatura **cieca** che caccia il giocatore *ascoltando le vibrazioni del terreno*: appena percepisce un rumore ti punta, ti insegue e attacca con un tuffo balistico; se lo disturbi con un richiamo, si volta verso quel suono.

Il lavoro si è svolto su due piani, come per il resto del gioco. Prima ho realizzato le **fondamenta condivise dei nemici** — la classe base del pawn, la classe base del controller IA con il suo modello di stati, e un toolkit di nodi di Behavior Tree riutilizzabili. Poi, su quelle fondamenta, ho costruito **interamente il verme**: la sua percezione uditiva, le sue due abilità, la sua animazione procedurale e il recupero dalla navmesh.

> Sulla stessa base condivisa vive anche un secondo nemico, la **mantide** (un predatore *vedente*, con un sistema di percezione a coni visivi). La mantide è lavoro di un collega e qui la nomino soltanto: questa pagina documenta la base e il verme.

---

## Panoramica

L'IA è divisa in livelli, dal più generico al più specifico:

| Livello | Classe / elemento | Responsabilità |
|---|---|---|
| **Pawn base** | `AStillHearAICharacterBase` | La base di ogni nemico: possiede l'ASC (eredita da [`AStillHearCharacterBase`](doc.html?p=stillhear&doc=gas)), gestisce velocità, waypoint, stun, reset e la reazione ai colpi. |
| **Controller base** | `AStillHearAIControllerBase` | La base di ogni cervello IA: percezione, appartenenza alla squadra, e il **modello di stati** (Ignaro → Sospettoso → Allertato/Caccia). |
| **Data asset** | `UAIInfo_DataAssetBase` (+ figli) | Tutti i numeri tarabili (velocità, durate, range d'ascolto…) vivono qui, mai nel codice. |
| **Toolkit BT** | Task / servizi / decoratori generici | Pattugliamento, movimento, cambio andatura, recupero navmesh: nodi riusabili da qualsiasi nemico. |
| **Verme** | `AAIWormCharacter`, `AAIWormController`, `UWormAnimInstance`, abilità, nav link | Il nemico completo, costruito su tutto quanto sopra. |

Il principio di fondo è lo stesso del resto del progetto: **il comportamento passa per i tag e per la blackboard**, e i valori sono guidati dai dati. Un nemico non cabla numeri: legge il suo data asset. Una parte di codice non chiede "in che stato sei?" a un'altra: legge un tag o una chiave di blackboard.

---

## Il modello di stati (base condivisa)

Il controller base definisce un insieme di stati di consapevolezza — rappresentati insieme da un **gameplay tag** sull'ASC, da una chiave di blackboard e da un evento per la UI. Il **verme però ne usa solo un sottoinsieme**: è un nemico diretto, quasi *ottuso*. Non investiga e non ti cerca davvero — appena ti percepisce (per udito o per contatto) scatta dritto ad **Allertato**, e ci resta finché un timer di raffreddamento non lo riporta **Ignaro**.

```
       sente rumore / contatto
 IGNARO ─────────────────────► ALLERTATO
    ▲                             │
    └──── raffreddamento (timer) ─┘

 STORDITO — stato trasversale: congela la logica finché dura
```

`UpdateCurrentStatusTag` centralizza le transizioni: aggiorna il tag corrente, lo scrive nella blackboard (`CurrentStatusTag`) e lo trasmette via `OnStatusTagChanged` — così l'indicatore sopra il nemico e il resto della UI reagiscono senza interrogare nessuno.

```cpp
// StillHearAIControllerBase.cpp — UpdateCurrentStatusTag (condensato)
case E_AITag::ALERTED:
    CurrentStatusTag = TAG_Status_EnemyAI_Alerted;
    GetNPCRef()->GetAbilitySystemComponent()->AddLooseGameplayTag(TAG_Status_EnemyAI_Alerted);
    break;
// …
if (IsValid(Blackboard))
    Blackboard->SetValueAsName(BlackboardKeyNames::KeyNameCurrentStatusTag, CurrentStatusTag.GetTagName());

OnStatusTagChanged.Broadcast(CurrentStatusTag);
```

Il controller base definisce anche l'**appartenenza alla squadra** (`GetTeamAttitudeTowards`): i nemici sono team 1, il giocatore è ostile, la squadra 255 è neutrale. E gestisce lo **hook di percezione** (`PerceptionEventReceived`) come metodo virtuale che ogni nemico concreto sovrascrive — perché il verme *sente*, la mantide *vede*, ma entrambi partono dalla stessa impalcatura.

> **La base regge più di quanto il verme usi.** Lo stesso modello prevede stati intermedi — **Sospettoso** e **Caccia** — pensati per un nemico che *indaga* prima di attaccare, riempiendo gradualmente un misuratore di consapevolezza a coni visivi. Quel flusso più ricco è della **mantide** (vedente, lavoro di un collega); il verme lo ignora di proposito, per restare una minaccia semplice e immediata.

---

## Il verme, nel dettaglio

### Un cacciatore che sente il terreno

Il verme monta un `UAIPerceptionComponent` con il senso **Udito**, ma la portata "grezza" del senso è solo il primo filtro. La logica vera è nel controller: quando arriva uno stimolo uditivo, controlla **il tipo di rumore** e lo confronta con la **portata specifica per quel tipo**, presa dal data asset.

```cpp
// AIWormController.cpp — PerceptionEventReceived (condensato)
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

Ogni tipo di rumore ha la sua portata, con questi valori di default nel data asset del verme:

| Andatura del giocatore | Portata d'ascolto (default) | Nel modello |
|---|---|---|
| Corsa | `750` uu | La soglia d'ascolto più ampia. |
| Camminata | `250` uu | Intermedia. |
| Accovacciato | `80` uu | La più contenuta tra i valori di default. |
| Campana (richiamo) | fino a `MaxHearingRange` | Esca deliberata: attira il verme, con un raffreddamento più lungo. |

> **Come si sente in gioco.** Quelli qui sopra sono il *meccanismo* e i suoi valori di default. Nel tuning finale, però, i designer hanno spinto il verme verso l'estremo aggressivo: in pratica basta produrre una vibrazione perché ti individui da quasi ovunque. Il sistema per-tipo di rumore resta la leva con cui lo *si potrebbe* rendere più permissivo — nel gioco, di proposito, non lo è.

Quando individua qualcosa, il verme diventa **Allertato**, memorizza la posizione del suono e fa partire un **timer di raffreddamento**: se non sente più nulla, torna **Ignaro** dopo `AlertCooldownTimer` secondi (o `BellCooldownTimer`, più lungo, se l'ultimo stimolo era la campana). Ha anche un secondo senso — **Tatto**: i collider di testa, corpo e coda riportano il contatto, e un contatto con la **testa uccide il giocatore** applicandogli un gameplay effect di morte.

### Movimento serpentino e control rig

Il verme non ruota come un personaggio umanoide: la sua testa insegue di continuo un punto — `LookAtPos` — che anticipa la sua velocità di 150 unità, e il resto del corpo la segue. Questo genera il caratteristico movimento sinuoso senza animazioni a mano.

```cpp
// AIWormCharacter.cpp — AdjustCapsuleRotation (condensato)
const FVector Direction = GetVelocity().GetSafeNormal();
LookAtPos->SetWorldLocation(GetActorLocation() + Direction * 150.f);

FRotator NewRotation = UKismetMathLibrary::FindLookAtRotation(GetActorLocation(), LookAtPos->GetComponentLocation());
NewRotation.Pitch = -NewRotation.Pitch;
HeadCollider->SetWorldRotation(InitialCapsuleRotation + NewRotation);
```

L'anim instance del verme (`UWormAnimInstance`) è volutamente **sottile**: ad ogni frame legge solo `LookAtPos` dal pawn e lo passa al **control rig**, che curva la mesh testa-corpo-coda verso quel punto. Tutto il resto sono flag booleani che il controller alza/abbassa in base allo stato — `bIsWalking`, `bIsRunning`, `bIsRoaring`, `bIsDiving`, `bIsAlerted` — e che l'anim graph usa per scegliere le pose.

```cpp
// WormAnimInstance.cpp — NativeUpdateAnimation
if (IsValid(Worm))
    LookAtPos = Worm->GetLookAtPosLocation();   // il control rig legge questo valore
```

Due dettagli di rifinitura vivono nel pawn/controller del verme:

- **Debris a terra.** Mentre striscia sul terreno, il controller attiva la gameplay cue `GameplayCue.GroundDebris` (polvere/detriti); la rimuove quando il verme è in aria durante il tuffo.
- **Separazione dai simili.** Se più vermi si avvicinano, ognuno applica una piccola forza di separazione (stile *boids*) per non compenetrarsi, raccogliendo i vicini tramite gli overlap dei propri collider.

### Le abilità del verme

Entrambe le abilità del verme sono *gameplay ability* costruite sulle [fondamenta GAS del gioco](doc.html?p=stillhear&doc=gas): dichiarano il proprio asset tag, si terminano da sole tramite ability task, e ripuliscono in `EndAbility`.

**Ruggito (`GA_WormRoar`).** Passa a `MOVE_Flying`, riproduce il montaggio del ruggito e attende un AnimNotify (`Event.EnemyAI.WormRoar`) che, nel frame giusto, applica l'effetto ad area del ruggito. Segna `HasRoared` nella blackboard e ripristina la camminata all'uscita.

**Tuffo del delfino (`GA_WormDolphinDive`).** È l'attacco. Non è innescato da un timer, ma dalla **navigazione stessa**: quando il percorso del verme attraversa un `ANavLink_WormDive` (un varco che non può percorrere camminando), lo *smart link* scatta, imposta la destinazione come bersaglio e attiva l'abilità.

```cpp
// NavLink_WormDive.cpp — quando il verme raggiunge il link
Controller->SetCurrentTargetLocation(DestinationPoint);
Asc->TryActivateAbilityByClass(WormDolphinDiveAbilityClass);
```

L'abilità calcola un **arco balistico** verso il bersaglio, lancia il verme e aspetta l'atterraggio (ritorno a `MOVE_Walking`) per terminare. Se il verme viene **stordito** a mezz'aria, l'abilità si cancella; il cooldown è committato all'attivazione:

```cpp
// GA_WormDolphinDive.cpp — ActivateAbility (condensato)
bool bArcFound = UGameplayStatics::SuggestProjectileVelocity_CustomArc(
    GetWorld(), LaunchVelocity, Worm->GetActorLocation(), Target + FVector(0,0,100));
if (!bArcFound) { EndAbility(..., /*bWasCancelled*/ true); return; }

WormAnimInstance->SetIsDiving(true);
Worm->LaunchCharacter(LaunchVelocity, true, true);

// termina all'atterraggio; si cancella se arriva lo stordimento
ASC->RegisterGameplayTagEvent(TAG_Status_EnemyAI_Stunned, ...).AddUObject(this, &ThisClass::OnStunTagAdded);
CommitAbilityCooldown(Handle, ActorInfo, ActivationInfo, true);
```

L'abilità è taggata sia come `GameplayAbility.EnemyAI.DolphinDive` sia come `GameplayAbility.EnemyAI.Attack` generica, così altri sistemi (feedback, UI di stato) possono reagire semplicemente all'idea di "il nemico sta attaccando".

---

## Il Behavior Tree del verme

Il comportamento del verme è un Behavior Tree diviso in tre pezzi: un **albero principale** che decide *cosa* sta facendo adesso, e due sotto-albero — **pattuglia** e **caccia** — per le due modalità principali. Tutto è montato con i nodi che ho scritto per l'occasione (molti generici e riusabili da altri nemici).

### L'albero principale — cosa sta facendo il verme

![Albero principale del Behavior Tree del verme](Images/stillhear/worm_bt_main.png)

Sotto la radice c'è un **Selector** sorvegliato dal servizio **Check NavMesh and Cache Position**, che a ogni frame tiene aggiornata l'informazione "sono sulla navmesh?". I rami del selector, in ordine di priorità (da sinistra):

1. **Stordito → fermo.** Se `CurrentStatusTag == Status.EnemyAI.Stunned`, un `FinishWithResult (InProgress)` tiene il verme immobile per tutta la durata dello stun. Il decoratore *aborts both*: qualunque cosa stesse facendo, si interrompe.
2. **Fuori navmesh → rientra.** Se il decoratore `Should Worm Return To NavMesh` è vero, esegue **Return to NavMesh**.
3. **Allertato → caccia.** Se `CurrentStatusTag != Status.EnemyAI.Unaware` (cioè ha percepito qualcosa), lancia il sotto-albero **BT_WormChase**.
4. **Altrimenti → pattuglia.** Il ramo di riposo: lancia **BT_WormPatrol**.

L'ordine non è casuale: stordimento e recupero navmesh stanno *sopra* caccia e pattuglia apposta — un verme stordito o sbalzato fuori mappa deve risolvere quello prima di ogni altra cosa.

**Il recupero dalla navmesh non è un extra: è necessario.** Il tuffo lancia il verme con un arco fisico che può farlo atterrare *fuori* dalla navmesh; senza recupero, resterebbe bloccato. Il servizio del ramo 2 controlla di continuo la proiezione sulla navmesh e, quando serve, memorizza il punto sicuro più vicino cercandolo a raggi crescenti (escludendo quello appena sotto il verme):

```cpp
// BTService_CheckNavMeshAndCachePosition.cpp — ricerca a raggi crescenti (condensato)
for (const float Extent : {100.f, 200.f, 400.f, 800.f, 1500.f})
{
    if (NavSys->ProjectPointToNavigation(PawnLocation, ProjectedLocation, FVector(Extent, Extent, Extent))
        && !IsProjectedPointUnderPawn(PawnLocation, ProjectedLocation.Location))
        break;   // trovato un punto sicuro utile (non appena sotto il verme)
    // …poi ritenta spostando la query lungo ±X e ±Y
}
```

### La pattuglia — il giro di riposo

![Sotto-albero di pattuglia del verme](Images/stillhear/worm_bt_patrol.png)

Da ignaro, il verme pattuglia. Un servizio **Change Speed Type** (gira una volta, non ticca) imposta l'andatura di camminata. Poi, sorvegliata dal decoratore `Is Waypoint Set?`, una **Sequence**: **Move To Waypoint** (verso `CurrentWaypoint`) → **Wait for Waypoint Time** (attende il `WaypointWaitTime` del waypoint) → **Set Next Waypoint** (avanza al successivo). Il giro lo compongono i designer concatenando gli attori `Waypoint`.

### La caccia — quando percepisce il giocatore

![Sotto-albero di caccia del verme](Images/stillhear/worm_bt_chase.png)

Appena il verme diventa allertato parte `BT_WormChase`. Letto dall'alto:

- **Ruggito, una volta sola.** Se `HasRoared` non è ancora settato, esegue **Roar** — un `ActivateAbilityAndWait` che attiva `GA_WormRoar`. Un ruggito d'ingresso, un colpo solo.
- Poi un **Selector** (con il servizio **Change Speed Type**, che qui alza l'andatura a corsa) sceglie fra tre comportamenti, per priorità:
  - **Ha suonato la campana?** (`WasBellPlayed` settato) → il verme è stato *ingannato*: una **Run EQS Query** (`EQS_PointNearTarget`) trova un punto vicino al suono, ci si sposta (**Move To**) e resta lì finché non ha un bersaglio reale (`TargetActor` non settato → `FinishWithResult InProgress`).
  - **Abbastanza vicino per tuffarsi?** (`IsCloseEnoughToTarget` settato) → verifica che esista un percorso verso il bersaglio (**Does path exist**, query gerarchica) e poi esegue il **Dolphin Dive** (`ActivateAbilityAndWait` su `GA_WormDolphinDive`).
  - **Ha sentito un suono?** (`TargetActor` settato) → **Move To** verso il bersaglio, con il servizio **Check Distance From Actor** che a ogni frame controlla se il verme è entrato nel range di tuffo — e in tal caso alza `IsCloseEnoughToTarget`, sbloccando il ramo del tuffo qui sopra.

In sintesi, la caccia è una macchina a priorità: prima ruggisce; poi, se è stato ingannato dalla campana insegue l'esca, se è a tiro si tuffa, altrimenti insegue il bersaglio finché non è abbastanza vicino per tuffarsi.

### I mattoni riutilizzabili

Molti dei nodi qui sopra sono **generici**: leggono/scrivono solo la blackboard e le classi base, quindi li riusa qualsiasi nemico. Li ho scritti come toolkit — `BTTask_SetNextWaypoint`, `BTTask_MoveToLocation`, il servizio `ChangeSpeedType`, il trio del recupero navmesh (`BTService_CheckNavMeshAndCachePosition`, `BTD_ShouldWormReturnToNavMesh`, `BTTask_ReturnToNavMesh`), i servizi di distanza `CheckDistanceFromActor`/`CheckDistanceFromTarget`, e `BTTask_ActivateAbilityAndWait` che fa da ponte tra BT e GAS. Tutte le chiavi di blackboard sono raccolte in un unico posto (`BlackboardKeyNames`), così non ci sono stringhe sparse nel codice e i nomi non vanno mai fuori sincrono tra C++ e asset.

---

## Morte e reset del mondo

I nemici si agganciano al reset globale del mondo (`OnRequestWorldReset` sul game instance). Quando il mondo si resetta, il verme annulla ogni abilità in corso, ripristina il controllo aereo, si riporta alla transform iniziale e riazzera lo stato IA e il waypoint di partenza — così non c'è stato residuo che "sanguina" nel nuovo tentativo.

```cpp
// StillHearAICharacterBase.cpp — ResetAfterDeath (condensato)
AbilitySystemComponent->CancelAllAbilities();
MoveComp->StopMovementImmediately();
SetActorLocationAndRotation(OriginalLocation, OriginalRotation, false, nullptr, ETeleportType::TeleportPhysics);
AICRef->ResetAIState();
AICRef->GetBlackboardComponent()->SetValueAsObject(BlackboardKeyNames::KeyNameCurrentWaypoint, StartingWaypoint);
```

---

## Guida per il designer

Quasi tutto il comportamento del verme si tara senza toccare codice:

1. **Data asset del verme (`UAIWormInfo_DataAsset`).** Qui vivono le portate d'ascolto (`Walk`/`Run`/`Crouch`), i timer di raffreddamento (allerta e campana), le distanze minima/massima del tuffo e le andature `Walk`/`Run`.
2. **Pattugliamento.** Piazza dei `Waypoint` nel livello e collegali in sequenza; assegna lo `StartingWaypoint` sul verme. Il tempo d'attesa a ciascun waypoint è una proprietà del waypoint.
3. **Punti di tuffo.** Dove il verme deve attraversare un varco con un tuffo, piazza un `ANavLink_WormDive`: il suo smart link fa scattare l'attacco quando il verme lo percorre.
4. **Debug d'ascolto.** Attiva `ShowDebugCircles` sul data asset per vedere a schermo i cerchi delle portate d'ascolto (con colori configurabili) mentre tari i valori.

**Checklist rapida**

| Obiettivo | Dove intervenire |
|---|---|
| Il verme sente troppo/poco | Portate `Walk`/`Run`/`Crouch` nel data asset |
| Resta allertato troppo a lungo | `AlertCooldownTimer` / `BellCooldownTimer` |
| Cambiare la gittata del tuffo | `Min`/`MaxDolphinDiveDistance` |
| Definire il giro di pattuglia | Catena di `Waypoint` + `StartingWaypoint` |
| Aggiungere un punto di tuffo | Piazzare un `ANavLink_WormDive` |

---

## Guida per il programmatore — un nuovo nemico sulla base

La base è pensata per essere sottoclassata. Per un nuovo nemico:

1. **Sottoclassa il pawn** (`AStillHearAICharacterBase`) e il **controller** (`AStillHearAIControllerBase`).
2. **Configura i sensi** facendo l'override di `SetupSightInfo()` e/o `SetupHearingInfo()`: leggono dal data asset e configurano il `UAIPerceptionComponent`, così i designer non toccano mai il controller.
3. **Reagisci alla percezione** con l'override di `PerceptionEventReceived`, traducendo gli stimoli in transizioni di stato (`UpdateCurrentStatusTag`) e chiavi di blackboard.
4. **Dai un data asset** (figlio di `UAIInfo_DataAssetBase`) per tutti i numeri.
5. **Costruisci il Behavior Tree** dai nodi generici del toolkit, aggiungendo solo i nodi specifici che ti servono.
6. **Le abilità** (attacchi ecc.) sono gameplay ability come le altre — vedi la pagina [Gameplay Ability System](doc.html?p=stillhear&doc=gas): dichiara i tag, attiva con `TryActivateAbilityByClass`, ripulisci in `EndAbility`.

### Punti di estensione a colpo d'occhio

| Se vuoi… | Fai questo |
|---|---|
| Un nemico con un senso diverso | Override di `SetupSightInfo`/`SetupHearingInfo` + `PerceptionEventReceived`. |
| Cambiare andatura da BT | Servizio `ChangeSpeedType` con lo speed type voluto. |
| Un attacco a distanza guidato dalla navigazione | Un nav link che attiva un'abilità (come `ANavLink_WormDive`). |
| Rendere un nemico recuperabile dopo un lancio | Aggiungi il ramo navmesh (servizio + decoratore + task di ritorno). |
| Reagire allo stato del nemico nella UI | Ascolta `OnStatusTagChanged` o leggi la chiave `CurrentStatusTag`. |

---

## Trappole e note

- **Il tuffo può sbalzare il verme fuori dalla navmesh.** Il ramo di recupero (servizio di controllo + decoratore + task di ritorno) non è opzionale: senza, un atterraggio fuori navmesh blocca il nemico. Il decoratore esclude apposta il caso "sta ancora tuffando".
- **La testa del verme è letale al contatto.** Solo il collider della testa applica l'effetto di morte al giocatore; corpo e coda servono a percezione tattile e separazione. Se sposti/riscali i collider, tieni presente questa divisione dei ruoli.
- **Il verme è cieco per scelta.** Non montare un senso Vista sul verme: tutto il design (e la leggibilità per il giocatore) si regge sul rapporto rumore/portata. Il flusso a coni visivi è del nemico vedente (mantide), non del verme.
- **L'animazione dipende dal control rig, non da montaggi di locomozione.** Il serpeggiamento nasce dal `LookAtPos` che guida il control rig; l'anim instance è di proposito minimale. Se cambi la catena testa-corpo-coda, aggiorna il rig, non l'anim instance.
- **Concedi le abilità del nemico una volta sola.** Vale la stessa guardia della base personaggio: i controller IA possono ri-possedere il pawn, e senza protezione le abilità verrebbero concesse due volte (vedi la pagina [GAS](doc.html?p=stillhear&doc=gas)).
