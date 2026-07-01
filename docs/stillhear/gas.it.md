# Gameplay Ability System e abilità

*Still Hear* costruisce **tutto il gameplay del personaggio sopra il Gameplay Ability System (GAS) di Unreal**: saltare, correre, accovacciarsi, arrampicarsi, scavalcare, il parry, le interazioni — ognuna è una *gameplay ability* a sé, attivata da un tag e capace di applicare effetti, suonare montaggi, aspettare eventi e ripulire dopo di sé.

Il mio lavoro qui è stato su due piani. Prima ho **messo in piedi le fondamenta GAS per tutto il team** — le classi base, l'ability system component, gli attributi, l'infrastruttura dei tag e le convenzioni d'uso — dopo aver fatto ricerca approfondita su come strutturare il tutto in modo che reggesse per il personaggio, il companion e i nemici. Poi, su quelle fondamenta, ho **scritto una parte delle abilità del giocatore**: tutto il movimento (salto, corsa, crouch) e tutto il traversal (arrampicata e superamento di ostacoli bassi).

Questa pagina spiega com'è costruita la base, quali convenzioni ho stabilito per il team, e come funzionano nel dettaglio le abilità che ho realizzato — con le note d'uso per designer e programmatori.

---

## Panoramica

Il sistema è organizzato in livelli, dal più generico al più specifico:

| Livello | Classe / elemento | Responsabilità |
|---|---|---|
| **Motore** | `UStillHearAbilitySystemComponent` | L'ability system component (ASC) del progetto: possiede attributi, effetti e abilità di un attore, e notifica quando la lista di abilità cambia. |
| **Contratto abilità** | `UStillHearGameplayAbility` | La classe base di **ogni** abilità del gioco: imposta i tag comuni, la instancing policy e corregge un bug di blocco tag di UE 5.5. |
| **Portatore** | `AStillHearCharacterBase` | La classe base dei personaggi: possiede l'ASC, concede le abilità iniziali e traduce eventi di movimento in tag/eventi GAS. |
| **Stato numerico** | `UBasicAttributeSet` | Gli attributi (velocità, moltiplicatore, angolo di parry) e la pipeline che li traduce in valori sul `CharacterMovement`. |
| **Vocabolario** | Catalogo dei *native gameplay tags* | La tassonomia condivisa di tag (`GameplayAbility.*`, `Status.*`, `Event.*`, `Data.*`, `GameplayCue.*`…) su cui tutto il sistema comunica. |

L'idea di fondo: un'abilità non conosce mai direttamente le altre. Tutto passa per i **tag** (chi è attivo, chi è bloccato, chi richiede cosa) e per i **gameplay event** (input rilasciato, notifica da animazione, collisione attivata). Questo rende il sistema estendibile senza toccare il codice esistente.

---

## Architettura della base

### L'Ability System Component

`UStillHearAbilitySystemComponent` estende l'ASC standard e aggiunge una sola cosa mirata: **si accorge quando le abilità di un attore cambiano** (concesse o rimosse) e lancia un evento, così che chi è interessato — tipicamente la UI — possa aggiornarsi senza fare polling.

```cpp
// StillHearAbilitySystemComponent.cpp — OnRep_ActivateAbilities (condensato)
// Confronto la lista corrente con una copia scattata l'ultima volta:
// se il numero cambia, o se un elemento è diverso, allora le abilità sono cambiate.
if (LastActivatableAbility.Num() != ActivatableAbilities.Items.Num())
{
    Character->SendAbilitiesChangedEvent();
    LastActivatableAbility = ActivatableAbilities.Items;
}
```

### La classe base delle abilità

`UStillHearGameplayAbility` è il **contratto comune** ereditato da ogni abilità. Nel costruttore imposta i default che valgono per tutte:

```cpp
// StillHearGameplayAbility.cpp
UStillHearGameplayAbility::UStillHearGameplayAbility()
{
    ActivationOwnedTags.AddTag(TAG_GameplayAbility_Active);   // "sono attiva adesso"
    ActivationBlockedTags.AddTag(TAG_Status_Death);           // da morto non attivo nulla
    InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
}
```

Ma la parte che vale la pena raccontare è il **fix di un bug di Unreal Engine 5.5**. In 5.5 è stata introdotta una regressione: se metti un tag **genitore** (es. `GameplayAbility.MainCharacter`) nella lista *Block Abilities With Tag*, il blocco non scatta più per le abilità figlie (es. `GameplayAbility.MainCharacter.Jump`), mentre nelle versioni precedenti funzionava. Per il nostro design è un problema serio, perché — come si vede più avanti — molte abilità bloccano proprio per famiglia di tag.

Ho quindi fatto l'override di `DoesAbilitySatisfyTagRequirements` correggendo il controllo incriminato:

```cpp
// StillHearGameplayAbility.cpp — dentro il controllo di blocco
// La riga originale era !ContainerA.HasAny(ContainerB), che invertiva la relazione
// genitore/figlio. La versione corretta interroga i container nel verso giusto:
if (ContainerA.IsEmpty() || ContainerB.IsEmpty() || !ContainerB.HasAny(ContainerA))
    return;   // nessun tag in comune → non bloccata
```

> **Perché conta:** le abilità di traversal (`Climb`, `LowVault`, `LowGetOnTop`) bloccano l'intera famiglia `GameplayAbility.MainCharacter` con un solo tag, invece di elencare una per una tutte le abilità da inibire. Senza questo fix, in UE 5.5 quel blocco per genitore sarebbe silenziosamente inefficace.

### Il portatore: `AStillHearCharacterBase`

È la classe base condivisa da personaggio, companion e nemici. Implementa `IAbilitySystemInterface`, crea e possiede l'ASC, e si occupa del **ciclo di vita delle abilità**:

```cpp
// StillHearCharacterBase.cpp — PossessedBy
AbilitySystemComponent->InitAbilityActorInfo(this, this);

if (!bStartingAbilitiesGranted)      // guardia contro ri-possessione (es. AI ripossiede il pawn)
{
    GrantAbilities(StartingAbilities);
    bStartingAbilitiesGranted = true;
}
```

La guardia `bStartingAbilitiesGranted` evita un bug sottile: senza di essa, una seconda `PossessedBy` (frequente con i controller AI) concederebbe di nuovo le stesse abilità, creando spec duplicate e facendo scattare due volte gli eventi che le attivano.

La classe base traduce anche lo **stato di movimento** in linguaggio GAS, così le abilità possono ragionare per tag invece di interrogare il `CharacterMovement`:

```cpp
// StillHearCharacterBase.cpp — OnMovementModeChanged
if (GetCharacterMovement()->MovementMode == MOVE_Falling)
    AbilitySystemComponent->AddLooseGameplayTag(TAG_Status_Falling);
else if (PrevMovementMode == MOVE_Falling)
    AbilitySystemComponent->RemoveLooseGameplayTag(TAG_Status_Falling);
```

| Metodo | A cosa serve |
|---|---|
| `GrantAbilities` / `RemoveAbilities` | Concede/rimuove abilità a runtime e notifica il cambiamento. |
| `SendAbilitiesChangedEvent` | Spara `Event.Abilities.Changed` (usato dalla UI). |
| `SendGameplayEventToSelf` | Helper per mandarsi un gameplay event (es. fine crouch fisico). |
| `OnMovementModeChanged` | Mantiene `Status.Falling` allineato allo stato reale. |
| `OnEndCrouch` | Notifica `Event.MainCharacter.EndCrouch` quando la capsula si rialza davvero. |

### Attributi e velocità

`UBasicAttributeSet` tiene i pochi valori numerici che le abilità modulano. Il cuore è la **pipeline della velocità**: `BaseSpeed` e `SpeedMultiplier` sono due attributi separati, e ogni volta che uno cambia il set ricalcola la velocità effettiva e la scrive direttamente sul movimento.

```cpp
// BasicAttributeSet.cpp
void UBasicAttributeSet::UpdateCharacterSpeed(float Base, float Multiplier) const
{
    const float FinalSpeed = Base * Multiplier;
    Character->GetCharacterMovement()->MaxWalkSpeed = FinalSpeed;
    Character->GetCharacterMovement()->MaxFlySpeed  = FinalSpeed;
}
```

Il vantaggio è che un'abilità come lo Sprint non tocca mai il movimento a mano: applica un **Gameplay Effect** che alza `SpeedMultiplier`, e la pipeline fa il resto. Quando l'effetto viene rimosso, la velocità torna da sola al valore base.

| Attributo | Default | Significato |
|---|---|---|
| `BaseSpeed` | `600` | Velocità di camminata di base. |
| `SpeedMultiplier` | `1.0` | Moltiplicatore applicato dagli effetti (sprint, rallentamenti…). |
| `MaxParryAngle` | — | Angolo massimo utile per la logica di parry. |

### Il vocabolario dei tag

Tutto il sistema comunica attraverso una tassonomia di *gameplay tag* nativi, organizzata per intento. È l'infrastruttura condivisa su cui poggiano tutte le abilità:

| Famiglia | Esempio | Uso |
|---|---|---|
| `GameplayAbility.*` | `GameplayAbility.MainCharacter.Jump` | Identità dell'abilità (asset tag) e blocco/cancellazione per famiglia. |
| `….Active` | `GameplayAbility.MainCharacter.Sprint.Active` | "Questa abilità è attiva adesso" (activation owned tag). |
| `Status.*` | `Status.Falling`, `Status.MainCharacter.Crouched` | Stato corrente dell'attore. |
| `Event.*` | `Event.InputReleased.Sprint`, `Event.Collision.Activate` | Segnali one-shot che le abilità aspettano. |
| `Data.*` | `Data.MainCharacter.ParryCooldown` | Chiavi *SetByCaller* per iniettare valori negli effetti. |
| `GameplayCue.*` | `GameplayCue.MainCharacter.Parry` | Aggancio per feedback audio/visivo replicabile. |

---

## Convenzioni che ho stabilito per il team

Perché più persone potessero aggiungere abilità senza pestarsi i piedi, ho fissato — e comunicato al gruppo — alcune convenzioni ricorrenti. Sono lo "scheletro" che ogni abilità del progetto segue:

1. **Un'abilità = un asset tag + il suo gemello `.Active`.** L'abilità si dichiara con `SetAssetTags(GameplayAbility.X)` e, mentre gira, possiede `GameplayAbility.X.Active`. Così le altre possono bloccarla, cancellarla o interrogarla per tag.
2. **Attivazione per classe.** Il personaggio attiva le abilità con `TryActivateAbilityByClass(...)`, mantenendo l'input disaccoppiato dalla logica interna dell'abilità.
3. **Il rilascio del tasto è un evento, non un polling.** Le abilità "a pressione continua" (Sprint, Crouch) restano attive finché non ricevono il loro `Event.InputReleased.*` tramite un `WaitGameplayEvent`.
4. **Le animazioni parlano tramite eventi.** Gli AnimNotify mandano gameplay event (es. `Event.Collision.Activate`) per sincronizzare la logica con i frame chiave del montaggio, invece di usare timer a occhio.
5. **I numeri "vivi" passano per SetByCaller.** Durate e cooldown non sono cablati nell'effetto: vengono iniettati con `SetSetByCallerMagnitude(Data.X, valore)` letto da un data asset, così i designer li tarano senza toccare codice.
6. **Ogni abilità ripulisce in `EndAbility`.** Effetti applicati, cue, collegamenti a delegate e modifiche al movimento vengono sempre annullati all'uscita, indipendentemente dal fatto che l'abilità sia finita o sia stata cancellata.

---

## Le abilità che ho realizzato

Le abilità del giocatore che ho scritto si dividono in due gruppi: i **modificatori di movimento/stato** (Jump, Sprint, Crouch) e il **traversal basato su montaggio** (Climb, LowVault, LowGetOnTop).

### Modificatori di movimento e stato

| Abilità | Innesco | Meccanica | Blocca / cancella |
|---|---|---|---|
| `GA_Jump` | Pressione salto | Verifica `PersonalizedCanJump()`, salta, applica un GE che dà lo stato "in aria", riproduce il force feedback, e resta attiva finché non si torna a `MOVE_Walking`. | Blocca **tutte** le `GameplayAbility` durante il salto. |
| `GA_Sprint` | Pressione corsa | Calcola il moltiplicatore `SprintSpeed / BaseSpeed` e applica un GE su `SpeedMultiplier`; aspetta `Event.InputReleased.Sprint` per terminare. | Blocca e cancella il Crouch. |
| `GA_Crouch` | Pressione crouch | `Character->Crouch()` + GE di stato `Status.MainCharacter.Crouched`, con cooldown iniettato via SetByCaller; aspetta `Event.InputReleased.Crouch`. | Si auto-blocca mentre attiva o mentre lo stato "crouched" è presente. |

Il **Salto** mostra bene il pattern "aspetta un evento invece di ticcare". Non conta i frame in aria: applica lo stato e delega a un task la fine.

```cpp
// GA_Jump.cpp — ActivateAbility (condensato)
MainCharacter->Jump();
Asc->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data);   // stato "in aria"

// L'abilità finisce da sé quando il personaggio ri-atterra
UAbilityTask_WaitMovementModeChange* Task =
    UAbilityTask_WaitMovementModeChange::CreateWaitMovementModeChange(this, MOVE_Walking);
Task->OnChange.AddDynamic(this, &UGA_Jump::OnMovementModeChange);
Task->ReadyForActivation();
```

Lo **Sprint** è l'esempio canonico di quanto la pipeline degli attributi semplifichi le cose: l'abilità non tocca mai `MaxWalkSpeed`, applica solo un effetto sul moltiplicatore.

```cpp
// GA_Sprint.cpp — applica il moltiplicatore via SetByCaller
const float Multiplier = Character->SprintSpeed / Character->BaseSpeed;
SpecHandle.Data->SetSetByCallerMagnitude(
    FGameplayTag::RequestGameplayTag("Data.SpeedMultiplier"), Multiplier);
Asc->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data);
// In EndAbility: RemoveActiveGameplayEffectBySourceEffect(...) → la velocità torna base
```

Il **Crouch** aggiunge un cooldown gestito con `ApplyCooldown`, dove il valore di durata non è cablato ma letto da un data asset e iniettato nell'effetto:

```cpp
// GA_Crouch.cpp — ApplyCooldown
SpecHandle.Data->SetSetByCallerMagnitude(
    TAG_Data_MainCharacter_CrouchCooldown, AbilityData->CooldownDuration);
```

### Traversal: montaggio + motion warping

Le tre abilità di traversal condividono la stessa impalcatura, e sono quelle che hanno spinto di più sul fix dei tag-genitore. Il pattern comune:

1. **Isolano il personaggio dal mondo fisico** per la durata dell'animazione: disattivano la risposta di collisione della capsula verso `WorldStatic` e passano a `MOVE_Flying`, così il movimento è guidato dal montaggio e non dalla fisica.
2. **Piazzano un target di motion warping** (`Climb`, `Landing`, `GetUp`) preso da un punto di riferimento calcolato sul personaggio, così il montaggio "aggancia" con precisione lo spigolo o il piano d'arrivo, indipendentemente da dove parte l'animazione.
3. **Suonano il montaggio** con un `PlayMontageAndWait` e finiscono l'abilità su completamento/interruzione/cancellazione, ripristinando collisioni, movement mode e IK dei piedi in `EndAbility`.

```cpp
// GA_Climb.cpp — ActivateAbility (condensato)
Character->GetCharacterMovement()->StopMovementImmediately();
Character->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
Character->GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Ignore);
Character->SetAnimationClimbing(true);      // disattiva l'IK trace dei piedi durante l'arrampicata

Character->MotionWarping->AddOrUpdateWarpTargetFromLocation(
    FName("Climb"), Character->GetMotionWarpTarget());

// PlayMontageAndWait → OnCompleted/OnInterrupted/OnCancelled tutti chiamano EndAbility
```

| Abilità | Warp target | Particolarità |
|---|---|---|
| `GA_Climb` | `Climb` | Arrampicata su parete. Blocca la famiglia `GameplayAbility.MainCharacter`, cancella il Jump. |
| `GA_LowVault` | `Landing` | Scavalca un ostacolo basso. Ri-posiziona il personaggio all'altezza giusta rispetto al muro, e **riattiva le collisioni a metà animazione** al ricevere `Event.Collision.Activate` (mandato da un AnimNotify sul frame in cui i piedi hanno superato l'ostacolo). |
| `GA_LowGetOnTop` | `GetUp` | Sale *sopra* un ostacolo basso e ci resta. |

Nel `LowVault` la sincronizzazione è affidata all'animazione: le collisioni non si riattivano dopo un timer arbitrario, ma esattamente nel frame in cui l'animazione lo richiede, perché è l'animazione stessa a segnalarlo.

```cpp
// GA_LowVault.cpp — la collisione torna quando l'anim lo dice
void UGA_LowVault::OnCollisionActivateEventReceived(FGameplayEventData Payload)
{
    Character->GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Block);
}
```

### Un contributo: il Parry

Al **Parry** ho contribuito, ma non è interamente farina del mio sacco: è stato un lavoro di squadra. Vale comunque la pena descriverne la forma, perché è l'abilità che mette insieme più pezzi del sistema in una volta sola.

Il Parry apre una **finestra temporale** durante un montaggio: al momento giusto (segnalato da un AnimNotify via `Event.Collision.Activate`) attiva una sfera di collisione attorno al personaggio, ci cerca i nemici taggati, e a chi trova applica un effetto di **stun**. Un parry riuscito innesca un pacchetto sensoriale — rallentamento del tempo tramite un `TimeManagementSubsystem`, camera FX, force feedback forte — e concede una breve **invulnerabilità**, alla cui fine parte il cooldown. È un buon esempio di come su questa base un'abilità possa orchestrare collisione, effetti, cue, feedback e stato senza uscire dal framework.

---

## Cosa regge ancora questa base

Le fondamenta che ho descritto non servono solo alle abilità che ho scritto io: **tutto il gameplay del gioco poggia qui sopra**. Sullo stesso scheletro girano altre abilità del giocatore e del companion realizzate dal team — la **Resonance** (match a tempo con oggetti risonanti), la **morte** come stato che cancella e blocca tutto, le **interazioni** Tap/Hold (che navigano fino all'oggetto più vicino e ne avviano/terminano l'uso) e la **SoundWave** del companion (mira, cambio bersaglio a schermo e sparo di un proiettile sonoro).

Anche i **nemici** vivono su questa stessa base: la classe personaggio condivisa vale per loro come per il giocatore, e le loro abilità seguono le stesse convenzioni. Quella parte — a partire dalla classe base del nemico e dal verme, che ho costruito interamente — è raccontata nella pagina dedicata ai nemici.

---

## Guida per il designer — configurare un'abilità

Le abilità sono classi C++, ma quasi tutto ciò che serve tararle è esposto a data:

1. **Concedila.** Aggiungi la classe dell'abilità all'array `StartingAbilities` del personaggio (o concedila a runtime con `GrantAbilities`). Viene data automaticamente alla possessione.
2. **Taratura dei numeri.** Durate, cooldown, raggi e simili stanno nei **data asset** dell'abilità (es. `CrouchData`, `ParryData`), non nel codice. Cambiali lì: vengono iniettati negli effetti via SetByCaller.
3. **Effetti di stato/velocità.** Le abilità che modulano la velocità applicano un Gameplay Effect sul `SpeedMultiplier` — imposta la magnitudine nell'effetto; ci pensa la pipeline degli attributi a scrivere il valore sul movimento.
4. **Montaggi e warp.** Per le abilità di traversal, assegna il `Montage` giusto e assicurati che il montaggio contenga gli AnimNotify attesi (es. quello che manda `Event.Collision.Activate` nel `LowVault`) e i warp target con i nomi corretti (`Climb`, `Landing`, `GetUp`).
5. **Feedback.** Cue (`GameplayCue.*`), camera FX preset e force feedback sono referenziati nei data asset dell'abilità: puoi sostituirli senza toccare la logica.

**Checklist rapida**

| Obiettivo | Dove intervenire |
|---|---|
| Dare/togliere un'abilità | `StartingAbilities` o `GrantAbilities`/`RemoveAbilities` |
| Cambiare un cooldown o una durata | Data asset dell'abilità (valore SetByCaller) |
| Cambiare quanto è veloce lo sprint | `SprintSpeed` sul personaggio + l'effetto sul moltiplicatore |
| Sincronizzare un'azione con l'animazione | AnimNotify che manda il gameplay event atteso |
| Cambiare VFX/SFX di un'abilità | Cue / preset nel data asset |

---

## Guida per il programmatore — scrivere una nuova abilità

Ogni abilità eredita da `UStillHearGameplayAbility` e segue lo stesso schema. Uno scheletro minimale:

```cpp
UGA_MyAbility::UGA_MyAbility()
{
    FGameplayTagContainer AssetTags;
    AssetTags.AddTag(TAG_GameplayAbility_MainCharacter_MyAbility);   // identità
    SetAssetTags(AssetTags);

    ActivationOwnedTags.AddTag(TAG_GameplayAbility_MainCharacter_MyAbility_Active); // "sono attiva"
    // BlockAbilitiesWithTag / CancelAbilitiesWithTag: per famiglia di tag, grazie al fix 5.5
}

void UGA_MyAbility::ActivateAbility(...)
{
    Super::ActivateAbility(...);
    // 1. valida avatar / dati; se manca qualcosa, EndAbility(..., bWasCancelled=true)
    // 2. applica effetti / avvia montaggi / abilita collisioni
    // 3. avvia un AbilityTask che aspetta la condizione di fine (evento, montaggio, movement mode)
}

void UGA_MyAbility::EndAbility(...)
{
    // annulla SEMPRE tutto ciò che ActivateAbility ha messo in piedi:
    // RemoveActiveGameplayEffectBySourceEffect, rimozione cue, ripristino movimento/collisioni
    Super::EndAbility(...);
}
```

### Punti di estensione a colpo d'occhio

| Se vuoi… | Fai questo |
|---|---|
| Modulare la velocità | Applica un GE su `SpeedMultiplier` (non toccare `MaxWalkSpeed` a mano). |
| Bloccare un'intera famiglia di abilità | Aggiungi il tag-genitore a `BlockAbilitiesWithTag` (funziona grazie al fix di `DoesAbilitySatisfyTagRequirements`). |
| Terminare su un input rilasciato | `WaitGameplayEvent` sul relativo `Event.InputReleased.*`. |
| Sincronizzarti con un frame d'animazione | AnimNotify che manda un gameplay event, atteso con `WaitGameplayEvent`. |
| Iniettare durate/cooldown da data | `SetSetByCallerMagnitude(Data.X, valore)` letto da un data asset. |
| Sapere se il personaggio è in aria | Leggi il tag `Status.Falling` invece di interrogare il movimento. |

---

## Trappole e note

- **Il fix dei tag-genitore è essenziale, non cosmetico.** Su UE 5.5, senza l'override di `DoesAbilitySatisfyTagRequirements`, bloccare per tag-genitore (`GameplayAbility.MainCharacter`) fallisce silenziosamente. Diverse abilità di traversal contano su quel blocco: se un giorno si aggiorna il motore, va verificato che il bug sia ancora presente prima di rimuovere l'override.
- **Concedi le abilità una volta sola.** La guardia `bStartingAbilitiesGranted` esiste perché `PossessedBy` può essere chiamata più volte (ri-possessione da parte dei controller): senza, si creano spec duplicate e gli eventi attivano l'abilità due volte.
- **Pulisci in `EndAbility`, sempre.** Ogni effetto applicato va rimosso con `RemoveActiveGameplayEffectBySourceEffect` (o per handle), ogni cue va tolta, ogni modifica a collisioni/movement mode va ripristinata — anche quando l'abilità è cancellata, non solo quando finisce da sé.
- **La velocità si tocca solo via effetti.** Scrivere `MaxWalkSpeed` a mano scavalca la pipeline e crea stati incoerenti: qualsiasi modulazione di velocità deve passare per un GE su `SpeedMultiplier`.
- **`MOVE_Flying` durante il traversal è voluto.** Le abilità di arrampicata/scavalcamento passano a volo e disattivano le collisioni della capsula apposta, per far guidare il montaggio; il ripristino avviene in `EndAbility` (e, per il `LowVault`, la collisione torna già a metà animazione via evento).
