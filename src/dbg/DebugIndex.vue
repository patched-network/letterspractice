<template>
    <div class="debug-index">
        <h1>🛠️ Debug & Development Tools</h1>

        <div class="debug-columns">
            <!-- LetterPeople Library -->
            <section class="debug-section">
                <h2>📝 LetterPeople Library</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/lp"
                            >🔤 LetterPeople Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/animations"
                            >🎬 Animations Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/animation-sequences"
                            class="featured"
                            >🎭 Animation Sequences</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/arms">💪 Arms Debug</router-link>
                    </li>
                    <li>
                        <router-link to="/dbg/juggling"
                            >🤹 Juggling Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/juggling-persistent" class="featured"
                            >🏐 Persistent Ball Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/ball-transfer" class="featured"
                            >🏐↔️ Cross-Actor Ball Transfer</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/physics" class="featured"
                            >⚛️ Physics Core Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/siteswap-physics" class="featured"
                            >🎪 Siteswap Physics Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/expressions"
                            >😊 Expressions Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/locomotion" class="featured"
                            >🚶 Locomotion Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/scene" class="featured"
                            >🎭 Scene Staging</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/floss" class="featured"
                            >💃 Floss Debug (Z-Layer & Skew)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/legs" class="featured"
                            >🦵 Legs Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/three" class="featured"
                            >🧊 three.js Letters (spike)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/lesson/three" class="featured"
                            >🧊 Lessons — 3D rework</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/lesson/gesture" class="featured"
                            >👆 Touch gesture reading (sounds vs word)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/family/three" class="featured"
                            >🧊 Family portrait — 3D port</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/family" class="featured"
                            >👨‍👩‍👧‍👦 Author Family Portrait</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Word Components -->
            <section class="debug-section">
                <h2>📖 Word Components</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/words"
                            >📋 Words Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/playground"
                            >🎮 Word Playground</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/wordcomponent"
                            >🧩 WordDisplay Test</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/phonetic-word" class="featured"
                            >🔊 PhoneticWord Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/audio-listener" class="featured"
                            >🎧 Audio Listener</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/contextual-phoneme" class="featured"
                            >🗣️ Contextual Phoneme Explorer</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/word-pictures" class="featured"
                            >🖼️ Word Pictures</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/word-pictures/styles"
                            >🎨 Word Picture Styles</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Keyboard & Questions -->
            <section class="debug-section">
                <h2>⌨️ Keyboard & Questions</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/keyboard"
                            >⌨️ ProgressiveKeyboard Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/keyboard-context"
                            >⌨️<>🂡 Keyboard Context Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/device-detection" class="featured"
                            >🖥️ Device Detection Debug</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Transform Functions -->
            <section class="debug-section">
                <h2>✨ Transform Functions</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/transforms"
                            >🎲 Transform Test</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/transform-playground"
                            class="featured"
                            >🎭 Transform Playground</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- UI & Theme -->
            <section class="debug-section">
                <h2>🎨 UI & Theme</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/theme"
                            >🌈 Theme Debug</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/logo-export"
                            >📦 Logo Exporter</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/color-utils"
                            >🎨 Color Utilities</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Question Types -->
            <section class="debug-section">
                <h2>❓ Question Types</h2>
                <ul class="debug-list">
                    <li>
                        <router-link
                            to="/dbg/questions/spelling"
                            class="featured"
                            >✏️ Spelling Question</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/who-said-that"
                            class="featured"
                            >🔊 Who Said That?</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/word-selection"
                            class="featured"
                            >🎯 Word Selection</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/missing-letters"
                            class="featured"
                            >🔡 Missing Letters</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/gpc-intro"
                            class="featured"
                            >🔤 GPC Introduction</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/digraph-gpc-intro"
                            class="featured"
                            >🔤 Digraph GPC Introduction</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/split-digraph-intro"
                            class="featured"
                            >✨ Split Digraph (Magic-E)
                            Introduction</router-link
                        >
                    </li>
                    <li>
                        <router-link
                            to="/dbg/questions/sight-word-intro"
                            class="featured"
                            >🙃 Sight Word Introduction</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- App Screens -->
            <section class="debug-section">
                <h2>📱 App Screens</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/study-hub" class="featured"
                            >🏠 Study Hub</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/milestone" class="featured"
                            >🏆 Free-tier wall (banner + /milestone)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/thinking-dots"
                            >🔵 Thinking Dots (loader)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/hub-scenes" class="featured"
                            >🎭 Hub Scenes</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/prop-scene" class="featured"
                            >🎪 Props & Choreography</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/chessboard" class="featured"
                            >♟ Chessboard Scene</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/practicing" class="featured"
                            >🎬 Practice Vignettes</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/session-summary" class="featured"
                            >📊 Session Summary</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/session-end" class="featured"
                            >🏁 Session End Screen</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/progress" class="featured"
                            >📈 Progress View</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/grader" class="featured"
                            >✏️ Spelling Grader (+ regression table)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/peek?fresh=1" class="featured"
                            >👀 Fresh Peek (first-time /peek; refresh to reset)</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Print / Posters -->
            <section class="debug-section">
                <h2>🖨️ Print Materials</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/poster" class="featured"
                            >📄 Poster — Default</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/poster/pei" class="featured"
                            >🏝️ Poster — PEI</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- Lessons -->
            <section class="debug-section">
                <h2>📚 Lessons</h2>
                <ul class="debug-list">
                    <li>
                        <router-link to="/dbg/lesson" class="featured"
                            >🎓 Lesson Viewer</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/lesson-reports" class="featured"
                            >📊 Lesson Reports</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/og"
                            >🖼️ Link-Preview Images (og:image): every page, its image, the drawn cards, structured data</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/dbg/reachable-words" class="featured"
                            >📈 Words Within Reach (mock)</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/lessons"
                            >📋 Lessons Catalog</router-link
                        >
                    </li>
                </ul>
            </section>

            <!-- System & Auth -->
            <!--
            <section class="debug-section">
                <h2>🔐 System & Authentication</h2>
                <div class="debug-cards">
                    <router-link to="/dbg/auth" class="debug-card">
                        <div class="card-icon">🔑</div>
                        <div class="card-content">
                            <h3>Auth Debug</h3>
                            <p>Authentication testing: login, logout, and user registration</p>
                            <div class="card-tags">
                                <span class="tag">Auth</span>
                                <span class="tag">Login</span>
                                <span class="tag">Signup</span>
                            </div>
                        </div>
                    </router-link>

                    <router-link to="/dbg/checkout" class="debug-card">
                        <div class="card-icon">💳</div>
                        <div class="card-content">
                            <h3>Checkout Debug</h3>
                            <p>Stripe checkout flow and payment integration testing</p>
                            <div class="card-tags">
                                <span class="tag">Stripe</span>
                                <span class="tag">Payments</span>
                                <span class="tag">Webhooks</span>
                            </div>
                        </div>
                    </router-link>
                </div>
            </section>
            -->

            <!-- Experimental Features -->
            <!--
            <section class="debug-section">
                <h2>🧪 Experimental Features</h2>
                <div class="debug-cards">
                    <router-link to="/dbg/shadow-test" class="debug-card experimental">
                        <div class="card-icon">🌟</div>
                        <div class="card-content">
                            <h3>Shadow Test</h3>
                            <p>Shadow effect testing (experimental, currently in development)</p>
                            <div class="card-tags">
                                <span class="tag">Experimental</span>
                                <span class="tag">SVG Effects</span>
                            </div>
                        </div>
                    </router-link>
                </div>
            </section>
            -->
        </div>
    </div>
</template>

<script setup lang="ts">
// No reactive data needed - this is a static index page
</script>

<style scoped>
.debug-index {
    padding: 8px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: "Segoe UI", system-ui, sans-serif;
}

.debug-index h1 {
    text-align: center;
    color: #2c3e50;
    margin-bottom: 8px;
    font-size: 1.4em;
    font-weight: 700;
}

.debug-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
}

.debug-section {
    margin-bottom: 0;
}

.debug-section h2 {
    color: #34495e;
    margin-bottom: 6px;
    font-size: 0.95em;
    border-bottom: 1px solid #3498db;
    padding-bottom: 3px;
}

.debug-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.debug-list li {
    margin-bottom: 4px;
}

.debug-list a {
    display: block;
    color: #2c3e50;
    text-decoration: none;
    font-size: 0.85em;
    padding: 4px 6px;
    border-radius: 4px;
    transition: all 0.2s ease;
    border-left: 2px solid transparent;
}

.debug-list a:hover {
    background-color: #f0f8ff;
    border-left-color: #3498db;
    color: #2980b9;
}

.debug-list a.featured {
    font-weight: 600;
    color: #e74c3c;
    border-left-color: #e74c3c;
    background-color: #fffbf9;
}

.debug-list a.featured:hover {
    background-color: #fff0ec;
    color: #c0392b;
}

/* Responsive Design */
@media (max-width: 1024px) {
    .debug-columns {
        grid-template-columns: 1fr;
    }
}
</style>
