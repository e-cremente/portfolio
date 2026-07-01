# Sistema di camere a volumi

*Still Hear* è un puzzle-platformer in terza persona con una **regia interamente costruita a mano**: invece di una singola camera su spring-arm che insegue il giocatore, i level designer "dipingono" il mondo con dei **volumi di camera**. Quando il giocatore entra in un volume, la camera di quel volume prende il controllo e la vista fa il blend verso di essa. Il volume attivo può anche **ridefinire gli assi di movimento**, così "spingi a destra sullo stick" significa sempre "muoviti verso destra sullo schermo" — anche mentre la camera sta scorrendo lungo una curva.

Questa pagina spiega com'è costruito il sistema, come dialogano i vari pezzi, e come usarlo ed estenderlo — sia dall'editor (designer) che da C++ (programmatori).

---

## Panoramica

Il sistema ha tre responsabilità, ciascuna gestita da un livello diverso:

| Responsabilità | Chi la gestisce | In breve |
|---|---|---|
| **Dove sta la camera / come si muove** | `ACameraVolume` e le sue sottoclassi | Ogni volume porta con sé il proprio `UCameraComponent` e la logica che lo posiziona/ruota. |
| **Quale volume è attivo e come si fa il blend** | `AStillHearMainCharacter` + `AStillHearPlayerController` | Il personaggio tiene traccia dei volumi con cui si sovrappone e ne sceglie uno per priorità; il controller esegue il blend vero e proprio. |
| **Allineare l'input alla vista** | `AStillHearPlayerController` | L'input di movimento è espresso rispetto alla direzione "destra" del volume attivo, e viene riallineato dolcemente quando cambia il volume. |

Il contratto tra i volumi di camera e il giocatore è una piccola interfaccia, `ICameraVolumesInteractor`, così un volume non deve mai conoscere la classe concreta del giocatore.

---

## Architettura a colpo d'occhio

| Classe | Tipo | Ruolo |
|---|---|---|
| `ACameraVolume` | `AActor` (Abstract) | Classe base. Box trigger + camera + freccia di input, più tutte le impostazioni di blend/priorità/rotazione/input. |
| `AFollowSplineCamera` | `ACameraVolume` | La camera scorre lungo una spline per inquadrare sempre il target dal punto più vicino sulla curva. |
| `AFollowSplineMaintainDistanceCamera` | `AFollowSplineCamera` | Uguale, ma mantiene una distanza fissa dal target e limita l'altezza della camera. |
| `ICameraVolumesInteractor` | `UInterface` | Contratto implementato da ciò che un volume può seguire (il giocatore). |
| `AStillHearMainCharacter` | `ACharacter` | Implementa l'interfaccia; tiene la lista dei volumi sovrapposti e seleziona quello attivo per priorità. |
| `AStillHearPlayerController` | `APlayerController` | Esegue `SetViewTargetWithBlend` e gestisce l'allineamento della direzione di input. |
| `ASceneManager` | `AActor` | Sceglie la camera **iniziale/di menu** per posizione o tag al caricamento del livello. |

**Struttura dei componenti di un volume di camera** (costruita in `ACameraVolume::ACameraVolume`):

```
ACameraVolume (RootComponent = Volume)
├── Volume         UBoxComponent   → box trigger interno (overlap = "il giocatore è dentro")
│   ├── OuterVolume UBoxComponent  → box leggermente più grande (interno + 10 uu), riservato
│   ├── Camera      UCameraComponent → la vista che questo volume fornisce
│   └── InputArrow  UArrowComponent → il suo forward vector definisce la "destra" a schermo
```

> Nella cartella `Camera/` esiste anche `AStillHearCamera`, ma è una **camera standalone legacy** e non è usata dal sistema a volumi. Ignorala quando lavori sui volumi di camera.

---

## Flusso a runtime: come un volume diventa attivo

L'intero passaggio di consegne è guidato dagli eventi di overlap sul box `Volume` interno.

**1 — Il volume rileva il giocatore e lo notifica.** `ACameraVolume` collega i suoi eventi di overlap nel costruttore e li inoltra tramite l'interfaccia — non fa mai il cast a un tipo concreto di giocatore:

```cpp
// CameraVolume.cpp
void ACameraVolume::BeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, ...)
{
    if (OtherActor && OtherActor->Implements<UCameraVolumesInteractor>())
    {
        ICameraVolumesInteractor::Execute_AddCameraVolumeToList(OtherActor, this);
    }
}
```

**2 — Il giocatore registra il volume e rivaluta.** Il personaggio tiene ogni volume con cui si sovrappone in `CameraVolumesList`, poi chiama `CheckList()`:

```cpp
// StillHearMainCharacter.cpp
void AStillHearMainCharacter::AddCameraVolumeToList_Implementation(ACameraVolume* CameraVolume)
{
    if (CameraVolumesList.Contains(CameraVolume)) return;
    CameraVolumesList.Add(CameraVolume);

    // Entrare in un nuovo volume significa che gli assi di input potrebbero dover essere ricalibrati
    if (AStillHearPlayerController* PC = Cast<AStillHearPlayerController>(GetController()))
        PC->ResetInputUpdate();

    CheckList();
}
```

**3 — La priorità decide il vincitore.** Con un solo volume vince di default; con più volumi vince la **`Priority` più alta**:

```cpp
// StillHearMainCharacter.cpp — CheckList()
int MaxPriority = -1;
ACameraVolume* NewCameraVolume = nullptr;
for (const auto Volume : CameraVolumesList)
{
    if (!IsValid(Volume)) continue;
    if (Volume->GetPriority() > MaxPriority)
    {
        MaxPriority     = Volume->GetPriority();
        NewCameraVolume = Volume;
    }
}
if (NewCameraVolume && NewCameraVolume != LastActiveCameraVolume)
    ActivateCameraVolume(NewCameraVolume);
```

**4 — L'attivazione passa la palla al controller.** Il nuovo volume viene attivato (il suo tick si accende), il precedente disattivato (il suo tick si spegne, per risparmiare), e il controller esegue il blend:

```cpp
// StillHearMainCharacter.cpp
void AStillHearMainCharacter::ActivateCameraVolume(ACameraVolume* CameraVolume)
{
    AStillHearPlayerController* PC = Cast<AStillHearPlayerController>(GetController());
    if (!PC) return;

    if (bForceSnapOnNextCamera)          // spawn / respawn / dopo una cinematica
    {
        CameraVolume->RequestSnapToTarget();
        bForceSnapOnNextCamera = false;
    }

    CameraVolume->Activate(this);        // SetActorTickEnabled(true) + memorizza l'attore seguito
    PC->ChangeCamera(CameraVolume, LastActiveCameraVolume);

    if (LastActiveCameraVolume && LastActiveCameraVolume != CameraVolume)
        LastActiveCameraVolume->Deactivate();

    LastActiveCameraVolume = CameraVolume;
}
```

Quando il giocatore esce da un volume, `EndOverlap` innesca il percorso speculare (`RemoveCameraVolumeFromList` → `CheckList`), così la camera ripiega su qualunque altro volume in cui il giocatore si trova ancora.

### La sequenza, dall'inizio alla fine

| Passo | Innesco | Chiamata | Risultato |
|---|---|---|---|
| 1 | Il giocatore entra nel box `Volume` | `ACameraVolume::BeginOverlap` | `Execute_AddCameraVolumeToList` |
| 2 | — | `AddCameraVolumeToList_Implementation` | volume salvato, richiesto reset input |
| 3 | — | `CheckList` | scelto il volume con priorità più alta |
| 4 | — | `ActivateCameraVolume` | vecchio volume off, nuovo on |
| 5 | — | `AStillHearPlayerController::ChangeCamera` | `SetViewTargetWithBlend` esegue il blend |
| 6 | Il giocatore esce dal box | `EndOverlap` → `RemoveCameraVolumeFromList` | lista aggiornata, `CheckList` rieseguito |

---

## Blend e priorità

Ogni volume porta con sé le proprie impostazioni di blend, così il *feeling* di ogni transizione è definito per-volume. `ChangeCamera` decide quale blend usare:

```cpp
// StillHearPlayerController.cpp — ChangeCamera (condensato)
if (bIsInMenuMode)                 { SetViewTargetWithBlend(CameraVolume, 0.f, ...); return; }  // istantaneo nei menu
if (CameraVolume->IsSnappingToTarget()) { SetViewTargetWithBlend(CameraVolume, 0.f, ...); return; } // snap istantaneo

if (!LastCameraVolume || !LastCameraVolume->GetUseBlendParametersOnExit())
    SetViewTargetWithBlend(CameraVolume, CameraVolume->GetBlendTimeOnEnter(), ...);   // guida il blend il volume in cui si entra
else
    SetViewTargetWithBlend(CameraVolume, LastCameraVolume->GetBlendTimeOnExit(), ...); // guida il blend il volume da cui si esce
```

La regola a parole:

- **Entrare** in un volume normalmente fa il blend sul `BlendTimeOnEnter` del volume **in cui si entra**.
- Un volume può invece prendere il controllo della *propria uscita* impostando `bUseBlendParametersOnExit` — allora **uscirne** fa il blend sul **suo** `BlendTimeOnExit`.
- Uno **snap** (spawn, respawn, o il primo frame dopo una cinematica) forza un blend di `0s`, così la camera non scivola mai visibilmente dalla posizione precedente.

| Proprietà | Tipo | Categoria | Significato |
|---|---|---|---|
| `Priority` | `int` | Configuration | Quando i volumi si sovrappongono, vince il valore più alto. |
| `BlendFunction` | `EViewTargetBlendFunction` | CameraBlend | Curva di interpolazione (Linear, Cubic, EaseIn/Out…). Default `VTBlend_Linear`. |
| `BlendExp` | `float` | CameraBlend | Esponente per le funzioni di blend non lineari. |
| `BlendTimeOnEnter` | `float` (s) | CameraBlend | Durata del blend quando questo volume diventa attivo. |
| `bUseBlendParametersOnExit` | `bool` | CameraBlend | Se true, uscire da questo volume usa i *suoi* parametri di uscita invece di quelli d'ingresso del volume successivo. |
| `BlendTimeOnExit` | `float` (s) | CameraBlend | Durata del blend usata in uscita, se il flag sopra è attivo. |

### Snap (nessun blend)

Lo snap è una richiesta one-shot, consumata al prossimo update:

```cpp
// CameraVolume.h / .cpp
void RequestSnapToTarget()  { bShouldSnapToTarget = true; }
bool IsSnappingToTarget() const { return bShouldSnapToTarget; }
```

`AStillHearMainCharacter::bForceSnapOnNextCamera` viene alzato allo spawn (`CheckFirstCameraAtSpawn`), al respawn (`ResetMovementState`) e dopo una cinematica (`AStillHearPlayerController::OnCinematicFinished` → `SetForceSnapOnNextCamera(true)`), così la prima camera che il giocatore vede è sempre netta, mai uno scivolamento lento dall'origine.

---

## Rotazione look-at

Se `bLookAtPlayer` è attivo, la classe base ruota la camera per tenere il target inquadrato, usando `RotationSpeed` — a meno che non ci sia uno snap in attesa, nel qual caso ruota istantaneamente:

```cpp
// CameraVolume.cpp — UpdateCamera (base)
const FRotator DesiredRotation =
    UKismetMathLibrary::FindLookAtRotation(CameraComponent->GetComponentLocation(),
                                           PlayerController->GetCharacter()->GetActorLocation());

if (bShouldSnapToTarget)
    CameraComponent->SetWorldRotation(DesiredRotation);                                   // istantaneo
else
    CameraComponent->SetWorldRotation(
        FMath::RInterpTo(StartRotation, DesiredRotation, DeltaTime, RotationSpeed));       // morbido
```

| Proprietà | Tipo | Categoria | Significato |
|---|---|---|---|
| `bLookAtPlayer` | `bool` | CameraRotation | Abilita il comportamento look-at. Se off, la camera mantiene la rotazione impostata. |
| `RotationSpeed` | `float` | CameraRotation | Velocità di interpolazione per il look-at morbido (mostrato solo se `bLookAtPlayer` è attivo). |

---

## L'input che segue la camera

Questo è il pezzo che rende piacevole controllare una camera guidata dai volumi. L'input di movimento **non** è espresso in assi mondiali — è espresso rispetto all'`InputArrow` del volume attivo, il cui forward vector viene trattato come "destra" a schermo:

```cpp
// CameraVolume.cpp
FVector ACameraVolume::GetRightDirection() const { return InputArrow->GetForwardVector(); }
```

Nel controller, la "destra" arriva dal volume e la "avanti" ne viene derivata, così premere su/destra sullo stick si mappa sempre sullo schermo:

```cpp
// StillHearPlayerController.cpp — HandleMoveTriggered (condensato)
const FVector ForwardInputDirection = CurrentRightInputDirection.GetSafeNormal().Cross(FVector::UpVector);
GetCharacter()->AddMovementInput(CurrentRightInputDirection, InputValue.X);
GetCharacter()->AddMovementInput(ForwardInputDirection,      InputValue.Y);
```

**Il problema che risolve:** se la direzione di input scattasse di colpo nell'istante in cui attraversi il confine verso un volume con orientamento diverso, il personaggio schizzerebbe lateralmente in modo visibile. Invece, quando il volume attivo cambia, il controller fa il **lerp** della direzione di input dalla vecchia alla nuova lungo `InputAdjustingTime`:

```cpp
// StillHearPlayerController.cpp — HandleMoveTriggered
else if (CurrentRightInputDirection != CameraVolume->GetRightDirection() && !bUpdateInputDirection)
{
    InitialDirection = CurrentRightInputDirection;
    FinalDirection   = CameraVolume->GetRightDirection();
    InputAdjustingTime = CameraVolume->GetHasPlayerAdjustedToInput() ? 0.01f
                                                                     : CameraVolume->GetInputAdjustingTime();
    bUpdateInputDirection = true;
}

// StillHearPlayerController.cpp — UpdateInputDirection (ogni frame)
InputDirectionLerpTime += DeltaTime;
const float Alpha = InputDirectionLerpTime / InputAdjustingTime;
CurrentRightInputDirection = FMath::Lerp(InitialDirection, FinalDirection, Alpha);
if (InputDirectionLerpTime >= InputAdjustingTime)
{
    CurrentRightInputDirection = FinalDirection;
    bUpdateInputDirection = false;
    if (CameraVolume->GetInputFollowsCamera())
        CameraVolume->SetHasPlayerAdjustedToInput(true);   // i riallineamenti successivi sono quasi istantanei
}
```

Quando `bInputFollowsCamera` è attivo, l'`InputArrow` stesso viene ri-orientato a ogni tick per combaciare con il right vector della camera, così lo schema di controllo continua a seguire una camera che sta ancora ruotando o scorrendo:

```cpp
// CameraVolume.cpp — UpdateInputArrow
if (!bInputFollowsCamera) return;
const FVector TargetDirection = CameraComponent->GetRightVector();
InputArrow->SetWorldRotation(FRotationMatrix::MakeFromX(TargetDirection).Rotator());
```

| Proprietà | Tipo | Categoria | Significato |
|---|---|---|---|
| `bInputFollowsCamera` | `bool` | Input | Se true, la "destra" dell'input insegue la camera a ogni frame (per camere che continuano a muoversi/ruotare). |
| `InputAdjustingTime` | `float` (s) | Input | Quanto impiega la direzione di input a riallinearsi quando cambia il volume attivo. Default `2.0`. |

---

## Camere su spline

### `AFollowSplineCamera`

Invece di stare ferma, questa camera **cavalca una spline**. A ogni frame trova il punto della spline più vicino al target, aggiunge un offset di design, e ci si sposta. La posizione è calcolata in `UpdateCamera` e applicata in `ApplyPosition`:

```cpp
// FollowSplineCamera.cpp — UpdateCamera
Super::UpdateCamera(TargetPoint, DeltaTime);   // la base gestisce la rotazione look-at

const float InputKey = Spline->FindInputKeyClosestToWorldLocation(TargetPoint);
float Distance = Spline->GetDistanceAlongSplineAtSplineInputKey(InputKey);
Distance += OffsetAlongSpline;
Distance  = FMath::Clamp(Distance, 0.0f, Spline->GetSplineLength());

DesiredCameraLocation =
    Spline->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World) + LocationOffset;
```

```cpp
// FollowSplineCamera.cpp — ApplyPosition (chiamata dal Tick)
if (bShouldSnapToTarget)
{
    CameraComponent->SetWorldLocation(DesiredCameraLocation);   // istantaneo
    bShouldSnapToTarget = false;                                // la sottoclasse resetta il flag qui
}
else
{
    const float InterpSpeed = (TimeToReachTargetPoint > KINDA_SMALL_NUMBER) ? (1.0f / TimeToReachTargetPoint) : 0.0f;
    CameraComponent->SetWorldLocation(
        FMath::VInterpTo(CameraComponent->GetComponentLocation(), DesiredCameraLocation, DeltaTime, InterpSpeed));
}
```

| Proprietà | Tipo | Categoria | Significato |
|---|---|---|---|
| `Spline` | `USplineComponent` | Components | Il percorso lungo cui viaggia la camera. |
| `TimeToReachTargetPoint` | `float` (s) | CameraBlend | Tempo approssimativo per raggiungere il punto desiderato (convertito in velocità di interpolazione). |
| `OffsetAlongSpline` | `float` (uu) | CameraOffset | Sposta la camera avanti/indietro rispetto al punto più vicino, lungo la spline. |
| `LocationOffset` | `FVector` | CameraOffset | Un offset in coordinate mondo aggiunto dopo il campionamento della spline. |

### `AFollowSplineMaintainDistanceCamera`

Una specializzazione che in più mantiene una distanza fissa dal target e limita l'altezza della camera — utile per mantenere un'inquadratura coerente su una spline che altrimenti si avvicinerebbe troppo o salirebbe troppo:

```cpp
// FollowSplineMaintainDistanceCamera.cpp — UpdateCamera
Super::UpdateCamera(TargetPoint, DeltaTime);   // prima campiona la spline

FVector Direction = DesiredCameraLocation - TargetPoint;
Direction.Normalize();
DesiredCameraLocation = TargetPoint + Direction * DistanceFromActor;   // ri-proietta a distanza fissa

if (MaxHeight != 0 && DesiredCameraLocation.Z > MaxHeight) DesiredCameraLocation.Z = MaxHeight;
if (MinHeight != 0 && DesiredCameraLocation.Z < MinHeight) DesiredCameraLocation.Z = MinHeight;
```

| Proprietà | Tipo | Categoria | Significato |
|---|---|---|---|
| `DistanceFromActor` | `float` (uu) | Distance From Actor | Distanza fissa che la camera mantiene dal target. |
| `MaxHeight` | `float` (uu) | Distance From Actor | Limite superiore sulla Z della camera (ignorato se `0`). |
| `MinHeight` | `float` (uu) | Distance From Actor | Limite inferiore sulla Z della camera (ignorato se `0`). |
| `ShowDesiredLocationHeight` | `bool` | Distance From Actor | Solo editor: stampa a schermo la Z calcolata per aiutarti a tarare i limiti. |

---

## Spawn, respawn, menu e cinematiche

Il sistema a volumi non gira solo mentre cammini in giro — è agganciato a ogni momento in cui la vista ha bisogno di una camera valida:

| Situazione | Punto d'ingresso | Cosa succede |
|---|---|---|
| **Inizio livello** | `AStillHearMainCharacter::CheckFirstCameraAtSpawn` | Forza l'aggiornamento degli overlap, aggiunge ogni volume sovrapposto, alza il flag di snap, poi `CheckList()`. |
| **Menu principale** | `ASceneManager::SetupMenuView` | Trova un volume per posizione di salvataggio, altrimenti per `DefaultMenuCameraTag`, altrimenti il primo; lo resetta alla sua transform di default e fa il blend. |
| **Respawn** | `AStillHearMainCharacter::ResetMovementState` | Svuota la lista dei volumi e lo stato dell'input, così il prossimo `CheckList` parte pulito e fa lo snap. |
| **Dopo una cinematica** | `AStillHearPlayerController::OnCinematicFinished` | Ri-aggiorna gli overlap, forza uno snap, azzera l'ultimo volume, riesegue `CheckList()`. |

`ASceneManager` può anche risolvere un volume puramente per posizione — comodo per piazzare la camera di menu/inizio senza un pawn che ci si sovrappone:

```cpp
// SceneManager.cpp — FindCameraVolumeAtLocation
for (AActor* Actor : FoundVolumes)
{
    ACameraVolume* Vol = Cast<ACameraVolume>(Actor);
    if (Vol && Vol->ContainsPoint(Location) && Vol->GetPriority() > BestPriority)
    {
        Best = Vol;
        BestPriority = Vol->GetPriority();
    }
}
```

`ContainsPoint` fa un test sul box che tiene conto della rotazione (trasforma il punto nello spazio locale del volume), quindi funziona anche per volumi piazzati inclinati.

---

## Guida per il designer — piazzare un volume di camera

Non serve toccare codice per creare camere. Trascina un attore volume nel livello e configuralo:

1. **Piazza il volume.** Aggiungi al livello un `FollowSplineCamera`, un `FollowSplineMaintainDistanceCamera`, o un figlio Blueprint di `ACameraVolume`.
2. **Dimensiona il trigger.** Scala il box `Volume` interno per coprire l'area in cui questa camera deve essere attiva. Il giocatore è "dentro" quando si sovrappone a questo box.
3. **Punta la camera.** Sposta/ruota il componente `Camera` per inquadrare lo spazio come vuoi.
4. **Imposta la priorità.** Dove due volumi si sovrappongono (zone di transizione), vince la `Priority` più alta. Dai il numero più alto all'inquadratura più specifica/importante.
5. **Definisci il blend.** Imposta `BlendTimeOnEnter` e `BlendFunction` per come la vista entra in dissolvenza. Se deve essere *questo* volume a controllare come la camera lo lascia, spunta `bUseBlendParametersOnExit` e imposta `BlendTimeOnExit`.
6. **Scegli la rotazione.** Abilita `bLookAtPlayer` (e tara `RotationSpeed`) per una camera che segue il giocatore; lasciala off per un'inquadratura bloccata e composta.
7. **Orienta l'input.** Ruota l'`InputArrow` così che la sua freccia forward punti dove la "destra sullo stick" deve mandare il giocatore a schermo. Abilita `bInputFollowsCamera` se la camera si muove abbastanza da voler far seguire lo schema di controllo; tara `InputAdjustingTime` per quanto dolcemente l'input si riallinea all'ingresso.
8. **Per le camere su spline**, modella la `Spline`, poi tara `OffsetAlongSpline` / `LocationOffset` e `TimeToReachTargetPoint`. Per la variante a distanza mantenuta, imposta `DistanceFromActor` e i limiti `Min`/`MaxHeight` (attiva `ShowDesiredLocationHeight` mentre tari).

**Checklist rapida**

| Obiettivo | Proprietà da toccare |
|---|---|
| Due volumi si contendono un punto | `Priority` |
| Transizione troppo veloce / lenta | `BlendTimeOnEnter` (o `BlendTimeOnExit`) |
| Transizione secca vs. morbida | `BlendFunction` + `BlendExp` |
| La camera deve seguire il giocatore | `bLookAtPlayer` + `RotationSpeed` |
| La "destra" manda il giocatore dalla parte sbagliata | ruota l'`InputArrow` |
| I comandi sembrano scattare all'ingresso | `InputAdjustingTime`, `bInputFollowsCamera` |

---

## Guida per il programmatore — estendere la classe base

`ACameraVolume` è `Abstract` ed è progettata per essere sottoclassata. In pratica si fa l'override di **un solo metodo**: `UpdateCamera`. Ecco il contratto da rispettare.

**La pipeline di tick.** Il `Tick` base aggiorna la freccia di input, poi chiama `UpdateCamera` con il target point recuperato tramite l'interfaccia:

```cpp
// CameraVolume.cpp — Tick (base)
UpdateInputArrow();
UpdateCamera(ICameraVolumesInteractor::Execute_GetTargetPointLocation(ActorInVolume), DeltaTime);

// Solo la classe base azzera il flag di snap qui.
// Le sottoclassi che muovono la camera nel proprio Tick devono azzerarlo da sole.
if (GetClass() == ACameraVolume::StaticClass())
    bShouldSnapToTarget = false;
```

**Il contratto del flag di snap.** `bShouldSnapToTarget` significa "nessuna interpolazione in questo update". La classe base lo resetta solo per sé stessa; una sottoclasse che posiziona la camera nel proprio tick è responsabile di consumarlo e azzerarlo — vedi `AFollowSplineCamera::ApplyPosition`, che fa esattamente questo. Se te ne dimentichi, la tua camera farà snap per sempre.

**Separazione delle responsabilità.** La rotazione (look-at) vive nel `UpdateCamera` base; la posizione vive nella tua sottoclasse. Chiama prima `Super::UpdateCamera(...)` per ereditare il look-at, poi calcola la tua posizione in `DesiredCameraLocation` e applicala.

**Un volume custom minimale** che orbita attorno al target a raggio fisso:

```cpp
UCLASS()
class AOrbitCamera : public ACameraVolume
{
    GENERATED_BODY()

protected:
    UPROPERTY(EditAnywhere, Category = "Configuration|Orbit")
    float Radius = 600.f;
    UPROPERTY(EditAnywhere, Category = "Configuration|Orbit")
    float InterpSpeed = 5.f;

    FVector DesiredLocation;

    virtual void Tick(float DeltaTime) override
    {
        Super::Tick(DeltaTime);   // esegue UpdateInputArrow + UpdateCamera (rotazione)
        ApplyPosition(DeltaTime);
    }

    virtual void UpdateCamera(FVector TargetPoint, float DeltaTime) override
    {
        Super::UpdateCamera(TargetPoint, DeltaTime);   // eredita il look-at
        const FVector Dir = (GetCamera()->GetComponentLocation() - TargetPoint).GetSafeNormal2D();
        DesiredLocation = TargetPoint + Dir * Radius;
    }

    void ApplyPosition(float DeltaTime)
    {
        if (IsSnappingToTarget())
        {
            GetCamera()->SetWorldLocation(DesiredLocation);
            bShouldSnapToTarget = false;      // azzera il flag protetto dopo aver applicato la posizione
        }
        else
        {
            GetCamera()->SetWorldLocation(
                FMath::VInterpTo(GetCamera()->GetComponentLocation(), DesiredLocation, DeltaTime, InterpSpeed));
        }
    }
};
```

**Cambiare *cosa* segue la camera.** Il volume chiede all'attore seguito il suo punto di focus tramite l'interfaccia, quindi puoi inquadrare qualcosa di diverso dall'origine dell'attore facendo l'override di una funzione sul giocatore:

```cpp
// Interfaccia implementata dal giocatore
FVector AStillHearMainCharacter::GetTargetPointLocation_Implementation()
{
    return GetActorLocation();   // fai l'override per inquadrare un socket, un punto di mira, ecc.
}
```

### Punti di estensione a colpo d'occhio

| Se vuoi… | Fai questo |
|---|---|
| Aggiungere un nuovo movimento di camera (orbita, dall'alto, rail…) | Sottoclassa `ACameraVolume`, override di `UpdateCamera`, applica la posizione nel `Tick`, azzera tu `bShouldSnapToTarget`. |
| Riusare il look-at | Chiama `Super::UpdateCamera(...)` prima della tua logica di posizione. |
| Cambiare il punto di focus | Override di `GetTargetPointLocation_Implementation` sul follower. |
| Reagire a entrata/uscita in una sottoclasse | Override di `BeginOverlap` / `EndOverlap` (chiama `Super`). |
| Creare camere senza C++ | Crea un figlio Blueprint di `ACameraVolume` (o di una sottoclasse spline). |

---

## Trappole e note

- **Resetta il flag di snap nelle classi derivate.** Solo il `Tick` base azzera `bShouldSnapToTarget`, e solo per la classe base esatta (`GetClass() == ACameraVolume::StaticClass()`). Ogni sottoclasse che muove la camera deve azzerarlo dopo aver applicato la posizione.
- **`UpdateCamera` calcola, `ApplyPosition` applica.** Nelle camere su spline il codice di posizionamento vive in `ApplyPosition` (chiamata dal `Tick`), non dentro `UpdateCamera`; `UpdateCamera` riempie solo `DesiredCameraLocation`. Mantieni questa separazione quando sottoclassi, così snap e interpolazione restano corretti.
- **`OuterVolume` è riservato.** Viene creato leggermente più grande del box interno (`interno + 10 uu`) ma al momento **non ha eventi di overlap collegati** — è un segnaposto per una futura banda di isteresi, non logica attiva.
- **`AStillHearCamera` è legacy.** L'attore camera standalone in `Camera/StillHearCamera.*` non fa parte di questo sistema e non è referenziato da nessuna parte; non confonderlo con `ACameraVolume`.
- **I volumi disattivati non fanno tick.** `Activate`/`Deactivate` commutano il tick dell'attore, così ogni frame gira solo il singolo volume attivo — tieni qualsiasi lavoro pesante per-frame dentro quel tick controllato.

---

## Correlato: il sotto-sistema `CameraEffects`

Accanto ai volumi nella cartella `Camera/`, `UCameraEffectsComponent` (posseduto dal player controller) sovrappone **effetti transitori** — camera shake, impulsi di FOV e "kick" di offset posizionale — sopra a qualunque cosa stia facendo il volume attivo. È completamente data-driven tramite `FCameraEffectPreset` (shake / FOV / offset, ciascuno attivabile in modo indipendente) e applica FOV/offset tramite `UCameraModifier` dedicati, così non sovrascrive mai i valori base del volume. È documentato a parte, ma vale la pena sapere che si compone in modo pulito con il sistema a volumi, senza entrare in conflitto.
