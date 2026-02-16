// CardGame - Inscryption-inspired card battle
// Full screen takeover — replaces game update/draw entirely
// Dark candlelit atmosphere, turn-based combat, sacrifice mechanic

// ==========================================
// Procedural Audio — all sounds synthesized
// ==========================================
class CardAudio {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.35;
            this.master.connect(this.ctx.destination);
        } catch (_) {
            this.ctx = null;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    // -- Utility helpers --

    _osc(type, freq, duration, vol = 0.3, freqEnd = null) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), now + duration);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
        o.connect(g).connect(this.master);
        o.start(now);
        o.stop(now + duration);
    }

    _noise(duration, vol = 0.15, filterFreq = 4000, filterEnd = null) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(filterFreq, now);
        if (filterEnd !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 20), now + duration);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(filt).connect(g).connect(this.master);
        src.start(now);
        src.stop(now + duration);
    }

    _chord(freqs, duration, type = 'sine', vol = 0.12) {
        freqs.forEach(f => this._osc(type, f, duration, vol));
    }

    // -- Game event sounds --

    cardSelect() {
        this.resume();
        this._osc('sine', 900, 0.06, 0.2, 1400);
    }

    cardPlace() {
        this.resume();
        // Table thud + paper slap
        this._osc('sine', 90, 0.12, 0.35, 40);
        this._noise(0.08, 0.12, 2000, 400);
    }

    sacrifice() {
        this.resume();
        // Dark resonant sweep downward
        this._osc('sawtooth', 250, 0.35, 0.2, 50);
        this._osc('sine', 120, 0.4, 0.15, 40);
        this._noise(0.2, 0.08, 1500, 200);
    }

    sacrificeComplete() {
        this.resume();
        // Blood payment gong
        this._osc('sine', 160, 0.5, 0.25, 80);
        this._osc('sine', 320, 0.35, 0.12, 160);
        this._noise(0.15, 0.1, 3000, 500);
    }

    bellRing() {
        this.resume();
        // Metallic bell with harmonics
        this._osc('sine', 880, 0.8, 0.2);
        this._osc('sine', 1320, 0.6, 0.1);
        this._osc('sine', 2640, 0.4, 0.06);
        this._osc('triangle', 440, 0.9, 0.08);
    }

    attack() {
        this.resume();
        // Quick impact slash
        this._noise(0.1, 0.2, 3000, 600);
        this._osc('sine', 100, 0.08, 0.25, 50);
    }

    directDamage() {
        this.resume();
        // Heavy HP hit
        this._osc('sine', 65, 0.2, 0.35, 30);
        this._noise(0.15, 0.18, 2500, 300);
        this._osc('square', 80, 0.1, 0.08, 40);
    }

    cardDeath() {
        this.resume();
        // Crumble / shatter
        this._noise(0.3, 0.15, 5000, 200);
        this._osc('sawtooth', 180, 0.25, 0.1, 40);
    }

    drawCard() {
        this.resume();
        // Paper shuffle swoosh
        this._noise(0.07, 0.1, 6000, 2000);
    }

    drawSquirrel() {
        this.resume();
        // Cute chirp
        this._osc('sine', 1200, 0.08, 0.15, 1800);
        setTimeout(() => this._osc('sine', 1400, 0.06, 0.12, 2000), 80);
    }

    dealerPlace() {
        this.resume();
        // Darker thud
        this._osc('sine', 60, 0.15, 0.3, 30);
        this._noise(0.1, 0.1, 1200, 300);
    }

    airborneAttack() {
        this.resume();
        // Whoosh overhead
        this._noise(0.25, 0.12, 800, 4000);
        this._osc('sine', 300, 0.2, 0.08, 800);
    }

    deathtouchKill() {
        this.resume();
        // Poison hiss + death
        this._noise(0.3, 0.15, 8000, 3000);
        this._osc('sawtooth', 400, 0.2, 0.08, 100);
    }

    cancelAction() {
        this.resume();
        // Soft low click
        this._osc('sine', 400, 0.04, 0.15, 300);
    }

    victory() {
        this.resume();
        // Major chord - C E G (triumphant)
        this._chord([262, 330, 392], 1.2, 'sine', 0.15);
        this._chord([524, 660, 784], 0.8, 'triangle', 0.06);
        // Rising shimmer
        setTimeout(() => this._osc('sine', 784, 0.6, 0.1, 1568), 200);
    }

    defeat() {
        this.resume();
        // Minor chord - C Eb Gb (ominous)
        this._chord([131, 156, 185], 1.5, 'sawtooth', 0.08);
        this._chord([262, 311, 370], 1.2, 'sine', 0.06);
        // Low rumble
        this._osc('sine', 50, 1.5, 0.12, 25);
    }

    turnStart() {
        this.resume();
        // Subtle ambient tone
        this._osc('sine', 220, 0.3, 0.06, 260);
        this._osc('triangle', 330, 0.2, 0.03);
    }

    combatStart() {
        this.resume();
        // Tension build
        this._osc('sine', 150, 0.4, 0.1, 200);
        this._noise(0.15, 0.06, 1000, 400);
    }

    introAmbience() {
        this.resume();
        // Dark ambient drone
        this._osc('sine', 80, 2.0, 0.08, 75);
        this._osc('triangle', 120, 1.5, 0.04, 110);
    }
}

class CardGame {
    constructor(game) {
        this.game = game;
        this.takeover = true; // Full takeover — replaces normal game loop

        const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
        this.LANES = C.CARD_BOARD_LANES || 4;
        this.HAND_SIZE = C.CARD_HAND_SIZE || 4;
        this.STARTING_HP = C.CARD_STARTING_HP || 20;
        this.ANIM_SPEED = C.CARD_ANIMATION_SPEED || 0.3;

        // Game state
        this.state = 'intro'; // intro, playerTurn, sacrifice, combat, aiTurn, victory, defeat
        this.stateTimer = 0;
        this.turn = 0;

        // HP
        this.playerHP = this.STARTING_HP;
        this.dealerHP = this.STARTING_HP;

        // Board: arrays of LANES length, null = empty
        this.playerBoard = new Array(this.LANES).fill(null);
        this.dealerBoard = new Array(this.LANES).fill(null);

        // Card pool (must be defined before building decks)
        this.cardPool = this.defineCards();

        // Hand
        this.playerHand = [];
        this.deck = this.buildDeck();
        this.squirrelDeck = this.buildSquirrelDeck();

        // Sacrifice state
        this.sacrificeMode = false;
        this.sacrificeTarget = null; // Card in hand waiting to be played
        this.sacrificeCount = 0;
        this.sacrificeNeeded = 0;

        // Mouse interaction
        this.hoveredCard = null;
        this.hoveredLane = -1;
        this.hoveredButton = null;
        this.mouseX = 0;
        this.mouseY = 0;

        // Click handler (scoped to canvas to avoid interfering with other UI)
        this._clickHandler = (e) => this.handleClick(e);
        this._moveHandler = (e) => this.handleMouseMove(e);
        this._eventTarget = this.game.canvas || window;
        this._eventTarget.addEventListener('click', this._clickHandler);
        this._eventTarget.addEventListener('mousemove', this._moveHandler);

        // Animation
        this.animations = [];
        this.combatLog = [];

        // Dealer dialogue
        this.dealerText = '';
        this.dealerTextTimer = 0;
        this.dealerTextQueue = [];
        this.typewriterIndex = 0;
        this.typewriterTarget = '';
        this.typewriterTimer = 0;

        // Candle flicker
        this.candleFlicker = 1.0;
        this.candleTimer = 0;

        // Procedural audio
        this.audio = new CardAudio();

        // Start intro
        this.queueDealerText("Ah... a visitor.");
        this.queueDealerText("Sit. Let us play a game.");
        this.speakDealer("Ah, a visitor. Sit. Let us play a game.");
        this.audio.introAmbience();
        this.stateTimer = 4.0;

        // Hide game UI during card game
        this.hideGameUI();

        // Draw initial hand
        this.drawCards(this.HAND_SIZE);
    }

    defineCards() {
        return {
            squirrel: { name: 'Squirrel', attack: 0, health: 1, cost: 0, icon: '🐿️', desc: 'Free sacrifice fodder' },
            stoat:    { name: 'Stoat', attack: 1, health: 2, cost: 1, icon: '🦊', desc: 'A reliable companion' },
            wolf:     { name: 'Wolf', attack: 3, health: 2, cost: 2, icon: '🐺', desc: 'Fierce and hungry' },
            grizzly:  { name: 'Grizzly', attack: 4, health: 6, cost: 3, icon: '🐻', desc: 'Immovable force' },
            mantis:   { name: 'Mantis', attack: 1, health: 1, cost: 1, icon: '🦗', desc: 'Strikes adjacent lanes', sigil: 'bifurcated' },
            adder:    { name: 'Adder', attack: 1, health: 1, cost: 1, icon: '🐍', desc: 'Kills on touch', sigil: 'deathtouch' },
            bullfrog: { name: 'Bullfrog', attack: 1, health: 2, cost: 1, icon: '🐸', desc: 'Blocks flyers', sigil: 'mighty_leap' },
            raven:    { name: 'Raven', attack: 3, health: 1, cost: 2, icon: '🐦‍⬛', desc: 'Flies over blockers', sigil: 'airborne' },
            elk:      { name: 'Elk', attack: 2, health: 4, cost: 2, icon: '🦌', desc: 'Sturdy and dependable' },
            cat:      { name: 'Cat', attack: 0, health: 1, cost: 0, icon: '🐈‍⬛', desc: 'Nine lives...', sigil: 'undying' },
            ringworm: { name: 'Ringworm', attack: 0, health: 1, cost: 0, icon: '🪱', desc: 'Sacrifice this' },
            mole:     { name: 'Mole', attack: 0, health: 4, cost: 1, icon: '🐀', desc: 'Burrows to block', sigil: 'burrower' },
        };
    }

    buildDeck() {
        const cards = [];
        const distribution = [
            'stoat', 'stoat', 'stoat',
            'wolf', 'wolf',
            'grizzly',
            'mantis', 'mantis',
            'adder',
            'bullfrog', 'bullfrog',
            'raven',
            'elk', 'elk',
            'cat',
            'ringworm',
            'mole',
        ];
        distribution.forEach(id => {
            cards.push(this.createCard(id));
        });
        // Shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
    }

    buildSquirrelDeck() {
        const cards = [];
        for (let i = 0; i < 20; i++) {
            cards.push(this.createCard('squirrel'));
        }
        return cards;
    }

    createCard(id) {
        const template = this.cardPool[id];
        return {
            id,
            ...template,
            currentHealth: template.health,
            justPlayed: false
        };
    }

    drawCards(count) {
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            if (this.playerHand.length >= 10) break;
            if (this.deck.length > 0) {
                this.playerHand.push(this.deck.pop());
                drawn++;
            }
        }
        if (drawn > 0) this.audio.drawCard();
    }

    drawSquirrel() {
        if (this.playerHand.length >= 10) return;
        if (this.squirrelDeck.length > 0) {
            this.playerHand.push(this.squirrelDeck.pop());
        } else {
            this.playerHand.push(this.createCard('squirrel'));
        }
        this.audio.drawSquirrel();
    }

    // ==================
    // Turn Logic
    // ==================

    startPlayerTurn() {
        this.state = 'playerTurn';
        this.turn++;
        this.sacrificeMode = false;
        this.sacrificeTarget = null;

        this.audio.turnStart();

        // Draw 1 card + 1 free squirrel
        this.drawCards(1);
        this.drawSquirrel();

        const messages = [
            "Your move.",
            "Choose wisely.",
            "The board awaits.",
            "Play... or ring the bell.",
            "What shall you sacrifice?",
        ];
        this.queueDealerText(messages[Math.floor(Math.random() * messages.length)]);
    }

    tryPlayCard(handIndex, laneIndex) {
        const card = this.playerHand[handIndex];
        if (!card) return;

        if (this.playerBoard[laneIndex] !== null) return; // Lane occupied

        if (card.cost === 0) {
            // Free to play
            this.placeCard(handIndex, laneIndex);
        } else {
            // Enter sacrifice mode
            this.sacrificeMode = true;
            this.sacrificeTarget = { handIndex, laneIndex, card };
            this.sacrificeCount = 0;
            this.sacrificeNeeded = card.cost;
        }
    }

    trySacrifice(laneIndex) {
        const boardCard = this.playerBoard[laneIndex];
        if (!boardCard) return;

        // Remove the card from the board (sacrifice it)
        this.playerBoard[laneIndex] = null;
        this.sacrificeCount++;
        this.audio.sacrifice();

        if (this.sacrificeCount >= this.sacrificeNeeded) {
            // Place the card
            this.audio.sacrificeComplete();
            this.placeCard(this.sacrificeTarget.handIndex, this.sacrificeTarget.laneIndex);
            this.sacrificeMode = false;
            this.sacrificeTarget = null;
        }
    }

    placeCard(handIndex, laneIndex) {
        const card = this.playerHand.splice(handIndex, 1)[0];
        card.justPlayed = true;
        this.playerBoard[laneIndex] = card;
        this.audio.cardPlace();
    }

    ringBell() {
        // End player turn -> combat
        this.state = 'combat';
        this.stateTimer = 0.5;
        this.sacrificeMode = false;
        this.sacrificeTarget = null;
        this.audio.bellRing();
    }

    resolveCombat() {
        this.audio.combatStart();
        let anyAttack = false;
        let anyDeath = false;
        let anyDirectDmg = false;

        // Player creatures attack first
        for (let i = 0; i < this.LANES; i++) {
            const attacker = this.playerBoard[i];
            if (!attacker || attacker.attack <= 0) continue;

            // Check for bifurcated (strikes adjacent lanes too)
            const lanes = [i];
            if (attacker.sigil === 'bifurcated') {
                if (i > 0) lanes.unshift(i - 1);
                if (i < this.LANES - 1) lanes.push(i + 1);
            }

            lanes.forEach(lane => {
                const defender = this.dealerBoard[lane];
                // Airborne: flies over blockers unless they have mighty_leap
                if (defender && attacker.sigil === 'airborne' && defender.sigil !== 'mighty_leap') {
                    // Airborne bypasses this blocker — direct damage to dealer
                    this.dealerHP -= attacker.attack;
                    this.audio.airborneAttack();
                    anyDirectDmg = true;
                } else if (defender) {
                    if (attacker.sigil === 'deathtouch') {
                        defender.currentHealth = 0;
                        this.audio.deathtouchKill();
                    } else {
                        defender.currentHealth -= attacker.attack;
                        anyAttack = true;
                    }
                    if (defender.currentHealth <= 0) {
                        this.dealerBoard[lane] = null;
                        anyDeath = true;
                    }
                } else {
                    // No defender — direct damage to dealer
                    this.dealerHP -= attacker.attack;
                    anyDirectDmg = true;
                }
            });
        }

        // Play aggregate sounds (avoid overlapping too many)
        if (anyAttack) this.audio.attack();
        if (anyDeath) this.audio.cardDeath();
        if (anyDirectDmg) this.audio.directDamage();

        // Check win
        if (this.dealerHP <= 0) {
            this.state = 'victory';
            this.stateTimer = 0;
            this.queueDealerText("...Impossible.");
            this.speakDealer("Impossible.");
            this.audio.victory();
            return;
        }

        let anyDealerAttack = false;
        let anyDealerDeath = false;
        let anyDealerDirectDmg = false;

        // Dealer creatures attack
        for (let i = 0; i < this.LANES; i++) {
            const attacker = this.dealerBoard[i];
            if (!attacker || attacker.attack <= 0) continue;

            const defender = this.playerBoard[i];
            if (defender) {
                // Check for mighty_leap blocking airborne
                if (attacker.sigil === 'airborne' && defender.sigil !== 'mighty_leap') {
                    this.playerHP -= attacker.attack;
                    this.audio.airborneAttack();
                    anyDealerDirectDmg = true;
                } else {
                    defender.currentHealth -= attacker.attack;
                    anyDealerAttack = true;
                    if (defender.currentHealth <= 0) {
                        // Check undying sigil
                        if (defender.sigil === 'undying') {
                            defender.currentHealth = 1;
                        } else {
                            this.playerBoard[i] = null;
                            anyDealerDeath = true;
                        }
                    }
                }
            } else {
                this.playerHP -= attacker.attack;
                anyDealerDirectDmg = true;
            }
        }

        if (anyDealerAttack) this.audio.attack();
        if (anyDealerDeath) this.audio.cardDeath();
        if (anyDealerDirectDmg) this.audio.directDamage();

        // Check loss
        if (this.playerHP <= 0) {
            this.state = 'defeat';
            this.stateTimer = 0;
            this.queueDealerText("How... unfortunate.");
            this.speakDealer("How unfortunate.");
            this.audio.defeat();
            return;
        }

        // Move to AI turn
        this.state = 'aiTurn';
        this.stateTimer = 1.5;
    }

    dealerPlayTurn() {
        // Simple AI: place cards in empty lanes, prioritize lanes where player has creatures
        const possibleCards = ['stoat', 'wolf', 'bullfrog', 'adder', 'raven'];

        for (let i = 0; i < this.LANES; i++) {
            if (this.dealerBoard[i]) continue;

            // Higher chance to play if player has a creature in this lane
            const playerHasCreature = this.playerBoard[i] !== null;
            const playChance = playerHasCreature ? 0.7 : 0.3;

            if (Math.random() < playChance) {
                // Pick a card based on difficulty (scales with turn)
                let cardId;
                if (this.turn >= 4 && Math.random() < 0.3) {
                    cardId = 'wolf';
                } else if (this.turn >= 6 && Math.random() < 0.2) {
                    cardId = 'grizzly';
                } else {
                    cardId = possibleCards[Math.floor(Math.random() * possibleCards.length)];
                }

                this.dealerBoard[i] = this.createCard(cardId);
                this.audio.dealerPlace();
            }
        }

        // Dealer says something
        const messages = [
            "My turn.",
            "Interesting...",
            "This should suffice.",
            "You cannot win.",
            "The odds are... not in your favor.",
        ];
        this.queueDealerText(messages[Math.floor(Math.random() * messages.length)]);

        // Back to player turn
        this.startPlayerTurn();
    }

    cancelSacrifice() {
        this.sacrificeMode = false;
        this.sacrificeTarget = null;
        this.sacrificeCount = 0;
    }

    // ==================
    // Input
    // ==================

    handleMouseMove(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    }

    handleClick(e) {
        const x = e.clientX;
        const y = e.clientY;
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;

        if (this.state === 'intro') {
            // Transition directly to playerTurn without drawing extra cards
            // (initial hand was already drawn in constructor)
            this.state = 'playerTurn';
            this.turn = 1;
            this.stateTimer = 0;
            this.audio.resume();
            this.audio.bellRing();
            return;
        }

        if (this.state === 'victory') {
            // Award coins and exit
            const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
            if (this.game.onPortalEnter) {
                this.game.onPortalEnter('hallway');
            }
            return;
        }

        if (this.state === 'defeat') {
            // Penalty and restart or exit
            const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
            // Restart game
            this.audio.bellRing();
            this.restart();
            return;
        }

        if (this.state !== 'playerTurn') return;

        // Calculate layout
        const layout = this.getLayout(W, H);

        // Check bell button
        if (this.isPointInRect(x, y, layout.bell)) {
            this.ringBell();
            return;
        }

        // Check squirrel button
        if (this.isPointInRect(x, y, layout.squirrelBtn)) {
            this.drawSquirrel();
            return;
        }

        // Sacrifice mode: click board cards to sacrifice
        if (this.sacrificeMode) {
            // Check if clicking on player board lane to sacrifice
            for (let i = 0; i < this.LANES; i++) {
                if (this.playerBoard[i] && this.isPointInRect(x, y, layout.playerLanes[i])) {
                    this.trySacrifice(i);
                    return;
                }
            }
            // Right-click or click elsewhere to cancel (handled by right-click context menu being prevented)
            // Cancel if clicking elsewhere
            this.cancelSacrifice();
            this.audio.cancelAction();
            return;
        }

        // Check hand cards
        for (let i = 0; i < this.playerHand.length; i++) {
            const cardRect = this.getHandCardRect(i, layout);
            if (this.isPointInRect(x, y, cardRect)) {
                // Selected a card — now need a lane
                this.selectedHandCard = i;
                this.audio.cardSelect();
                return;
            }
        }

        // Check player board lanes (to place selected card)
        if (this.selectedHandCard !== undefined && this.selectedHandCard !== null) {
            for (let i = 0; i < this.LANES; i++) {
                if (this.isPointInRect(x, y, layout.playerLanes[i])) {
                    this.tryPlayCard(this.selectedHandCard, i);
                    this.selectedHandCard = null;
                    return;
                }
            }
            this.selectedHandCard = null;
        }
    }

    isPointInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    getLayout(W, H) {
        const centerX = W / 2;
        const laneW = 100;
        const laneH = 120;
        const laneGap = 12;
        const totalLanesW = this.LANES * laneW + (this.LANES - 1) * laneGap;
        const lanesStartX = centerX - totalLanesW / 2;

        const boardY = H * 0.32;
        const playerBoardY = boardY + laneH + 20;

        const dealerLanes = [];
        const playerLanes = [];

        for (let i = 0; i < this.LANES; i++) {
            const lx = lanesStartX + i * (laneW + laneGap);
            dealerLanes.push({ x: lx, y: boardY, w: laneW, h: laneH });
            playerLanes.push({ x: lx, y: playerBoardY, w: laneW, h: laneH });
        }

        return {
            dealerLanes,
            playerLanes,
            handY: H - 160,
            lanesStartX,
            laneW,
            laneH,
            bell: { x: W - 110, y: H - 110, w: 80, h: 80 },
            squirrelBtn: { x: 20, y: H - 110, w: 80, h: 55 },
            centerX,
            boardY,
            playerBoardY,
        };
    }

    getHandCardRect(index, layout) {
        const cardW = 80;
        const cardH = 110;
        const gap = 8;
        const totalW = this.playerHand.length * (cardW + gap) - gap;
        const startX = layout.centerX - totalW / 2;
        return {
            x: startX + index * (cardW + gap),
            y: layout.handY,
            w: cardW,
            h: cardH
        };
    }

    restart() {
        this.playerHP = this.STARTING_HP;
        this.dealerHP = this.STARTING_HP;
        this.playerBoard = new Array(this.LANES).fill(null);
        this.dealerBoard = new Array(this.LANES).fill(null);
        this.playerHand = [];
        this.deck = this.buildDeck();
        this.squirrelDeck = this.buildSquirrelDeck();
        this.turn = 0;
        this.sacrificeMode = false;
        this.sacrificeTarget = null;
        this.selectedHandCard = null;
        this.drawCards(this.HAND_SIZE);
        this.queueDealerText("Shall we... try again?");
        this.speakDealer("Shall we try again?");
        // Go directly to playerTurn without drawing extra cards
        // (HAND_SIZE cards already drawn above)
        this.state = 'playerTurn';
        this.turn = 1;
    }

    // ==================
    // Dealer Voice
    // ==================

    queueDealerText(text) {
        // Sets (replaces) the current dealer text with typewriter effect
        this.dealerTextQueue.push(text);
        if (this.dealerTextTimer <= 0) {
            this._advanceDealerText();
        }
    }

    _advanceDealerText() {
        if (this.dealerTextQueue.length === 0) return;
        const text = this.dealerTextQueue.shift();
        this.typewriterTarget = text;
        this.typewriterIndex = 0;
        this.typewriterTimer = 0;
        this.dealerText = '';
        this.dealerTextTimer = 4.0;
    }

    speakDealer(text) {
        // Dark robotic voice — pitch 0.1, rate 0.55
        // Distinct from all player alien voices (which range 0.3-2.0 pitch, 0.5-2.0 rate)
        if (typeof window !== 'undefined' && window.StrictHotelTTS) {
            window.StrictHotelTTS.speak(text, {
                pitch: 0.1,   // Extremely low — inhuman, robotic
                rate: 0.55,   // Slow, menacing cadence
            });
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.55;
            utterance.pitch = 0.1;
            utterance.volume = 0.9;
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) utterance.voice = voices[0];
            window.speechSynthesis.speak(utterance);
        }
    }

    // ==================
    // Update & Draw
    // ==================

    update(dt) {
        // Candle flicker
        this.candleTimer += dt;
        this.candleFlicker = 0.85 + 0.15 * Math.sin(this.candleTimer * 5) * Math.sin(this.candleTimer * 7.3);

        // Typewriter effect
        if (this.typewriterIndex < this.typewriterTarget.length) {
            this.typewriterTimer += dt;
            if (this.typewriterTimer > 0.04) {
                this.typewriterTimer = 0;
                this.typewriterIndex++;
                this.dealerText = this.typewriterTarget.substring(0, this.typewriterIndex);
            }
        }

        if (this.dealerTextTimer > 0) {
            this.dealerTextTimer -= dt;
            if (this.dealerTextTimer <= 0) {
                // Advance to next queued text if available
                this._advanceDealerText();
            }
        }

        // State machine
        if (this.state === 'intro') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                // Transition without drawing extra cards (initial hand already drawn)
                this.state = 'playerTurn';
                this.turn = 1;
            }
        }

        if (this.state === 'combat') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.resolveCombat();
            }
        }

        if (this.state === 'aiTurn') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.dealerPlayTurn();
            }
        }
    }

    // Get the contextual hint text based on current game state
    getHintText() {
        if (this.state === 'intro') return '';
        if (this.state === 'combat') return 'Combat resolving...';
        if (this.state === 'aiTurn') return 'Dealer is playing...';
        if (this.state === 'victory') return '';
        if (this.state === 'defeat') return '';

        // Player turn hints
        if (this.sacrificeMode) {
            return `SACRIFICE ${this.sacrificeCount}/${this.sacrificeNeeded} — Click your creatures on the board to sacrifice them (or click elsewhere to cancel)`;
        }
        if (this.selectedHandCard !== null && this.selectedHandCard !== undefined) {
            const card = this.playerHand[this.selectedHandCard];
            if (card) {
                return `"${card.name}" selected — Click an empty lane on YOUR row to place it`;
            }
            return 'Click an empty lane on YOUR row to place the card';
        }

        // Default player turn hints
        const hasPlayableCards = this.playerHand.length > 0;
        const hasCardsOnBoard = this.playerBoard.some(c => c !== null);

        if (!hasPlayableCards && !hasCardsOnBoard) {
            return 'Draw a 🐿️ Squirrel (bottom-left) or ring the 🔔 Bell to end turn';
        }
        if (hasPlayableCards) {
            return 'Click a card in your hand to select it — then place it on an empty lane';
        }
        return 'Ring the 🔔 Bell (bottom-right) to end your turn';
    }

    draw(ctx, cameraX, cameraY) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const layout = this.getLayout(W, H);

        // Pitch black background
        ctx.fillStyle = '#0a0804';
        ctx.fillRect(0, 0, W, H);

        // Candle glow (warm radial gradient from center-top)
        const glowX = W / 2;
        const glowY = H * 0.25;
        const glowRadius = Math.min(W, H) * 0.7 * this.candleFlicker;
        const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
        glow.addColorStop(0, `rgba(255, 180, 80, ${0.25 * this.candleFlicker})`);
        glow.addColorStop(0.5, `rgba(200, 120, 40, ${0.1 * this.candleFlicker})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Dark wood table surface
        const tableGrad = ctx.createLinearGradient(0, layout.boardY - 20, 0, H);
        tableGrad.addColorStop(0, '#1a1208');
        tableGrad.addColorStop(0.5, '#221a0d');
        tableGrad.addColorStop(1, '#0d0a06');
        ctx.fillStyle = tableGrad;
        ctx.fillRect(W * 0.1, layout.boardY - 20, W * 0.8, H - layout.boardY + 20);

        // Draw dealer silhouette
        this.drawDealer(ctx, W, H);

        // Draw board lanes (with selection highlights)
        this.drawBoard(ctx, layout, W, H);

        // Draw hand
        this.drawHand(ctx, layout, W, H);

        // Draw bell
        this.drawBell(ctx, layout);

        // Draw squirrel button
        this.drawSquirrelButton(ctx, layout);

        // Draw HP displays
        this.drawHP(ctx, layout, W, H);

        // Draw dealer text
        this.drawDealerText(ctx, W, H);

        // Draw contextual hint bar
        this.drawHintBar(ctx, layout, W, H);

        // Draw row labels
        this.drawRowLabels(ctx, layout, W);

        // Draw state overlays
        if (this.state === 'victory') {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 36px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('YOU WIN', W / 2, H / 2 - 20);
            ctx.fillStyle = '#c9b896';
            ctx.font = '16px monospace';
            ctx.fillText('Click to exit', W / 2, H / 2 + 20);
            ctx.restore();
        }

        if (this.state === 'defeat') {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#b04040';
            ctx.font = 'bold 36px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('DEFEATED', W / 2, H / 2 - 20);
            ctx.fillStyle = '#c9b896';
            ctx.font = '16px monospace';
            ctx.fillText('Click to try again', W / 2, H / 2 + 20);
            ctx.restore();
        }

        if (this.state === 'intro') {
            this.drawIntroOverlay(ctx, W, H);
        }
    }

    drawIntroOverlay(ctx, W, H) {
        ctx.save();
        // Darker overlay
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.75, this.stateTimer * 0.25)})`;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        let y = H * 0.22;

        // Title
        ctx.fillStyle = '#c9a54a';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚔ CARD GAME ⚔', cx, y);
        y += 40;

        // Rules
        ctx.fillStyle = '#c9b896';
        ctx.font = '13px monospace';
        const rules = [
            '🃏  Click a card in your hand, then click a lane to play it',
            '🩸  Stronger cards cost Blood — sacrifice board creatures to pay',
            '🐿️  Draw a free Squirrel each turn (perfect sacrifice fodder)',
            '⚔   Your creatures attack the lane across from them',
            '💔  If nothing blocks, damage goes straight to the Dealer',
            '🔔  Ring the Bell (bottom-right) to end your turn',
            '🏆  Reduce the Dealer\'s HP to 0 to win!',
        ];
        rules.forEach(rule => {
            ctx.fillText(rule, cx, y);
            y += 24;
        });

        y += 20;
        // Pulsing "click to begin"
        const pulse = 0.6 + 0.4 * Math.sin(this.candleTimer * 3);
        ctx.fillStyle = `rgba(201, 165, 74, ${pulse})`;
        ctx.font = 'bold 18px monospace';
        ctx.fillText('[ Click to Begin ]', cx, y);

        ctx.restore();
    }

    drawHintBar(ctx, layout, W, H) {
        const hint = this.getHintText();
        if (!hint) return;

        ctx.save();

        // Position above the hand area
        const hintY = layout.handY - 24;

        // Semi-transparent background strip
        ctx.fillStyle = 'rgba(10, 8, 4, 0.7)';
        ctx.fillRect(W * 0.1, hintY - 14, W * 0.8, 28);

        // Hint text
        ctx.fillStyle = this.sacrificeMode ? '#b04040' : '#c9a54a';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, W / 2, hintY);

        ctx.restore();
    }

    drawRowLabels(ctx, layout, W) {
        ctx.save();
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';

        // Dealer row label
        ctx.fillStyle = 'rgba(176, 64, 64, 0.6)';
        ctx.fillText('DEALER', layout.lanesStartX - 10, layout.boardY + layout.laneH / 2 + 4);

        // Player row label
        ctx.fillStyle = 'rgba(107, 142, 78, 0.6)';
        ctx.fillText('YOU', layout.lanesStartX - 10, layout.playerBoardY + layout.laneH / 2 + 4);

        ctx.restore();
    }

    drawDealer(ctx, W, H) {
        const cx = W / 2;
        const cy = H * 0.12;

        ctx.save();

        // Shadowy figure outline
        ctx.fillStyle = 'rgba(10, 8, 4, 0.9)';
        // Head
        ctx.beginPath();
        ctx.ellipse(cx, cy, 35, 42, 0, 0, Math.PI * 2);
        ctx.fill();
        // Shoulders
        ctx.beginPath();
        ctx.ellipse(cx, cy + 55, 70, 30, 0, 0, Math.PI);
        ctx.fill();

        // Glowing amber eyes
        const eyeGlow = 0.7 + 0.3 * Math.sin(this.candleTimer * 2);
        ctx.fillStyle = `rgba(255, 160, 40, ${eyeGlow})`;
        ctx.shadowColor = '#ffaa33';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx - 12, cy - 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 12, cy - 5, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    drawBoard(ctx, layout, W, H) {
        const hasSelection = this.selectedHandCard !== null && this.selectedHandCard !== undefined;

        // Dealer lanes (top)
        for (let i = 0; i < this.LANES; i++) {
            const rect = layout.dealerLanes[i];
            this.drawLane(ctx, rect, this.dealerBoard[i], 'none', i);
        }

        // Player lanes (bottom)
        for (let i = 0; i < this.LANES; i++) {
            const rect = layout.playerLanes[i];
            let highlight = 'none';
            if (this.sacrificeMode && this.playerBoard[i] !== null) {
                highlight = 'sacrifice'; // Red highlight for sacrificeable cards
            } else if (hasSelection && this.playerBoard[i] === null && this.state === 'playerTurn') {
                highlight = 'placeable'; // Green highlight for empty slots when card selected
            }
            this.drawLane(ctx, rect, this.playerBoard[i], highlight, i);
        }
    }

    drawLane(ctx, rect, card, highlight, laneIndex) {
        ctx.save();

        // Lane background
        if (highlight === 'sacrifice') {
            ctx.fillStyle = 'rgba(176, 64, 64, 0.4)';
        } else if (highlight === 'placeable') {
            // Pulsing green glow for placeable lanes
            const pulse = 0.2 + 0.15 * Math.sin(this.candleTimer * 4);
            ctx.fillStyle = `rgba(107, 142, 78, ${pulse})`;
        } else {
            ctx.fillStyle = 'rgba(30, 25, 15, 0.7)';
        }
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        // Lane border
        if (highlight === 'sacrifice') {
            ctx.strokeStyle = '#b04040';
            ctx.lineWidth = 2;
        } else if (highlight === 'placeable') {
            ctx.strokeStyle = '#6b8e4e';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
        } else {
            ctx.strokeStyle = 'rgba(139, 115, 85, 0.4)';
            ctx.lineWidth = 1;
        }
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.setLineDash([]);

        // Draw card if present
        if (card) {
            this.drawBoardCard(ctx, rect, card);
        } else if (highlight === 'placeable') {
            // Show "place here" indicator in empty placeable lanes
            ctx.fillStyle = 'rgba(107, 142, 78, 0.5)';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▼ PLACE', rect.x + rect.w / 2, rect.y + rect.h / 2);
        }

        ctx.restore();
    }

    drawBoardCard(ctx, rect, card) {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;

        // Card background (dark parchment)
        ctx.fillStyle = '#2a2218';
        ctx.fillRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
        ctx.strokeStyle = '#5a4a30';
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);

        // Icon
        ctx.font = '28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.icon, cx, cy - 10);

        // Attack / Health at bottom
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#c9a54a';
        ctx.textAlign = 'left';
        ctx.fillText(`⚔${card.attack}`, rect.x + 10, rect.y + rect.h - 14);
        ctx.textAlign = 'right';
        const hpColor = card.currentHealth < card.health ? '#b04040' : '#6b8e4e';
        ctx.fillStyle = hpColor;
        ctx.fillText(`♥${card.currentHealth}`, rect.x + rect.w - 10, rect.y + rect.h - 14);

        // Sigil indicator
        if (card.sigil) {
            ctx.fillStyle = '#8a8580';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            const sigilText = card.sigil === 'airborne' ? '✈' : card.sigil === 'deathtouch' ? '☠' : card.sigil === 'bifurcated' ? '↔' : card.sigil === 'mighty_leap' ? '⬆' : card.sigil === 'undying' ? '∞' : card.sigil === 'burrower' ? '⛏' : '';
            ctx.fillText(sigilText, cx, rect.y + 14);
        }
    }

    drawHand(ctx, layout, W, H) {
        if (this.state !== 'playerTurn') return;

        let hoveredCardForTooltip = null;

        for (let i = 0; i < this.playerHand.length; i++) {
            const card = this.playerHand[i];
            const rect = this.getHandCardRect(i, layout);
            const isSelected = this.selectedHandCard === i;
            const isHovered = this.isPointInRect(this.mouseX, this.mouseY, rect);

            if (isHovered) hoveredCardForTooltip = { card, rect };

            ctx.save();

            // Card lift on hover/select
            const yOffset = (isHovered || isSelected) ? -15 : 0;

            // Card background with glow for selected
            if (isSelected) {
                ctx.shadowColor = '#c9a54a';
                ctx.shadowBlur = 8;
            }
            ctx.fillStyle = isSelected ? '#3a3020' : isHovered ? '#2a2015' : '#1a1510';
            ctx.fillRect(rect.x, rect.y + yOffset, rect.w, rect.h);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isSelected ? '#c9a54a' : isHovered ? '#8a7a50' : '#5a4a30';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(rect.x, rect.y + yOffset, rect.w, rect.h);

            // Cost badge (top-left, clearer)
            if (card.cost > 0) {
                // Red blood cost badge
                ctx.fillStyle = '#5a1a1a';
                ctx.fillRect(rect.x + 3, rect.y + yOffset + 3, 26, 16);
                ctx.fillStyle = '#e06060';
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`🩸${card.cost}`, rect.x + 16, rect.y + yOffset + 14);
            } else {
                // Free badge
                ctx.fillStyle = '#1a3a1a';
                ctx.fillRect(rect.x + 3, rect.y + yOffset + 3, 30, 16);
                ctx.fillStyle = '#6b8e4e';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('FREE', rect.x + 18, rect.y + yOffset + 14);
            }

            // Icon
            ctx.font = '26px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(card.icon, rect.x + rect.w / 2, rect.y + yOffset + 40);

            // Name
            ctx.fillStyle = '#c9b896';
            ctx.font = '10px monospace';
            ctx.fillText(card.name, rect.x + rect.w / 2, rect.y + yOffset + 68);

            // Stats at bottom
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = '#c9a54a';
            ctx.textAlign = 'left';
            ctx.fillText(`⚔${card.attack}`, rect.x + 6, rect.y + yOffset + rect.h - 10);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#6b8e4e';
            ctx.fillText(`♥${card.health}`, rect.x + rect.w - 6, rect.y + yOffset + rect.h - 10);

            // Sigil icon if present
            if (card.sigil) {
                ctx.fillStyle = '#8a8570';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                const sigilIcon = card.sigil === 'airborne' ? '✈' : card.sigil === 'deathtouch' ? '☠' : card.sigil === 'bifurcated' ? '↔' : card.sigil === 'mighty_leap' ? '⬆' : card.sigil === 'undying' ? '∞' : card.sigil === 'burrower' ? '⛏' : '';
                ctx.fillText(sigilIcon, rect.x + rect.w / 2, rect.y + yOffset + 82);
            }

            ctx.restore();
        }

        // Draw tooltip for hovered card
        if (hoveredCardForTooltip) {
            this.drawCardTooltip(ctx, hoveredCardForTooltip.card, hoveredCardForTooltip.rect, W);
        }
    }

    drawCardTooltip(ctx, card, cardRect, W) {
        ctx.save();

        const tooltipW = 180;
        const tooltipH = card.sigil ? 58 : 42;
        let tooltipX = cardRect.x + cardRect.w / 2 - tooltipW / 2;
        const tooltipY = cardRect.y - tooltipH - 22;

        // Clamp to screen
        if (tooltipX < 5) tooltipX = 5;
        if (tooltipX + tooltipW > W - 5) tooltipX = W - 5 - tooltipW;

        // Background
        ctx.fillStyle = 'rgba(20, 16, 10, 0.95)';
        ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH);
        ctx.strokeStyle = '#5a4a30';
        ctx.lineWidth = 1;
        ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH);

        // Card description
        ctx.fillStyle = '#c9b896';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(card.desc, tooltipX + tooltipW / 2, tooltipY + 16);

        // Cost explanation
        if (card.cost > 0) {
            ctx.fillStyle = '#b06060';
            ctx.font = '10px monospace';
            ctx.fillText(`Costs ${card.cost} blood (sacrifice ${card.cost} creature${card.cost > 1 ? 's' : ''})`, tooltipX + tooltipW / 2, tooltipY + 32);
        } else {
            ctx.fillStyle = '#6b8e4e';
            ctx.font = '10px monospace';
            ctx.fillText('Free to play', tooltipX + tooltipW / 2, tooltipY + 32);
        }

        // Sigil explanation
        if (card.sigil) {
            ctx.fillStyle = '#8a8570';
            ctx.font = '10px monospace';
            const sigilDesc = {
                airborne: 'Airborne: Flies over blockers',
                deathtouch: 'Deathtouch: Kills any creature',
                bifurcated: 'Bifurcated: Attacks adjacent lanes too',
                mighty_leap: 'Mighty Leap: Can block flyers',
                undying: 'Undying: Survives lethal damage once',
                burrower: 'Burrower: Moves to block threats',
            };
            ctx.fillText(sigilDesc[card.sigil] || card.sigil, tooltipX + tooltipW / 2, tooltipY + 48);
        }

        ctx.restore();
    }

    drawBell(ctx, layout) {
        const bell = layout.bell;

        ctx.save();
        const isHovered = this.isPointInRect(this.mouseX, this.mouseY, bell);
        const canRing = this.state === 'playerTurn';

        // Bell background with glow on hover
        ctx.fillStyle = isHovered ? '#3a3020' : '#1a1510';
        ctx.fillRect(bell.x, bell.y, bell.w, bell.h);
        ctx.strokeStyle = isHovered && canRing ? '#c9a54a' : '#5a4a30';
        ctx.lineWidth = isHovered && canRing ? 2 : 1;
        ctx.strokeRect(bell.x, bell.y, bell.w, bell.h);

        // Bell icon (larger)
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔔', bell.x + bell.w / 2, bell.y + bell.h / 2 - 10);

        // Label (bigger, clearer)
        ctx.fillStyle = isHovered && canRing ? '#c9a54a' : '#8a8580';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('END TURN', bell.x + bell.w / 2, bell.y + bell.h - 10);

        ctx.restore();
    }

    drawSquirrelButton(ctx, layout) {
        const btn = layout.squirrelBtn;

        ctx.save();
        const isHovered = this.isPointInRect(this.mouseX, this.mouseY, btn);
        const canDraw = this.state === 'playerTurn';

        ctx.fillStyle = isHovered ? '#3a3020' : '#1a1510';
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = isHovered && canDraw ? '#c9a54a' : '#5a4a30';
        ctx.lineWidth = isHovered && canDraw ? 2 : 1;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

        // Squirrel icon + label (clearer)
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐿️', btn.x + btn.w / 2, btn.y + btn.h / 2 - 6);

        ctx.fillStyle = isHovered && canDraw ? '#c9a54a' : '#8a8580';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('DRAW', btn.x + btn.w / 2, btn.y + btn.h - 6);

        ctx.restore();
    }

    drawHP(ctx, layout, W, H) {
        ctx.save();

        // Dealer HP (top)
        ctx.fillStyle = '#c9b896';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Dealer: ♥${Math.max(0, this.dealerHP)}`, 20, 30);

        // Player HP (bottom)
        ctx.textAlign = 'left';
        ctx.fillText(`You: ♥${Math.max(0, this.playerHP)}`, 20, H - 130);

        // Turn counter
        ctx.fillStyle = '#5a4a30';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Turn ${this.turn}`, W - 20, 30);

        ctx.restore();
    }

    drawDealerText(ctx, W, H) {
        if (this.dealerTextTimer <= 0 || !this.dealerText) return;

        const alpha = Math.min(1, this.dealerTextTimer);

        ctx.save();
        ctx.fillStyle = `rgba(201, 184, 150, ${alpha})`;
        ctx.font = 'italic 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`"${this.dealerText}"`, W / 2, H * 0.22);
        ctx.restore();
    }

    hideGameUI() {
        const ids = ['gameInfo', 'hudProfile', 'controlsInfo', 'hotbar', 'chatPanel'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    showGameUI() {
        const ids = ['gameInfo', 'hudProfile', 'controlsInfo', 'hotbar', 'chatPanel'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
    }

    destroy() {
        // Restore game UI
        this.showGameUI();

        this._eventTarget.removeEventListener('click', this._clickHandler);
        this._eventTarget.removeEventListener('mousemove', this._moveHandler);
        // Stop any ongoing TTS
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        // Close audio context
        if (this.audio && this.audio.ctx) {
            this.audio.ctx.close().catch(() => {});
        }
    }
}
