// ========================= 設定 =========================
// GAS ウェブアプリのエンドポイント（項目取得のみに使用）
const API_URL = 'https://script.google.com/macros/s/AKfycbwf3zdLLHwcpHh7ZDsuamkl__s8YCySxb8c-A2ZKdKw2G_tuHIceW9std9RVfALY8HkBg/exec';
// =======================================================

const SLICE_COLORS = ['#f783ac', '#ffcb00', '#ee5253', '#33bfff', '#1dd1a1', '#1e90ff', '#8e44ad', '#ff85a2'];

let items = [];
let currentRotation = 0;
let selectedItem = '';
let resultModal;
let isSpinning = false;

/**
 * ボタン押下時刻（Date.now()）をシードにした PRNG。mulberry32。
 */
function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * 起動処理：GAS から項目を取得して SVG を描画する。
 */
async function loadApp() {
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    spinBtn.textContent = '読み込み中...';

    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.error) throw new Error(data.message || data.error);

        items = Array.isArray(data.items) ? data.items : [];
        const title = data.title || 'マリミラルーレット';
        document.getElementById('page-title').textContent = title;
        document.title = title;

        resultModal = new bootstrap.Modal(document.getElementById('resultModal'));
        drawWheel();

        document.querySelector('.roulette-wrapper').addEventListener('click', spin);

        if (items.length === 0) {
            spinBtn.textContent = '項目がありません';
            return;
        }
        spinBtn.disabled = false;
        spinBtn.textContent = 'ルーレットを回す';
    } catch (err) {
        console.error('初期化失敗:', err);
        spinBtn.textContent = '読み込み失敗';
        alert('項目の取得に失敗しました。再読み込みしてください。\n' + err.message);
    }
}

/**
 * SVG ルーレット描画。items が変わるたびに呼び直せる。
 */
function drawWheel() {
    const group = document.getElementById('wheel-group');
    group.innerHTML = '';
    if (items.length === 0) return;

    const sliceAngle = 360 / items.length;
    // 文字サイズ：項目数に応じて 1.2px 〜 3.5px で可変
    const fontSize = Math.max(1.2, Math.min(3.5, 30 / Math.pow(items.length, 0.6)));
    // 円周側の配置位置 (半径50に対して 94% の位置)
    const base_xPos = 94;

    items.forEach((text, i) => {
        const startAngle = i * sliceAngle;
        const midAngle = startAngle + (sliceAngle / 2);

        const pathData = createArc(50, 50, 50, startAngle, startAngle + sliceAngle);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', SLICE_COLORS[i % SLICE_COLORS.length]);
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '0.2');
        group.appendChild(path);

        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        let rotation = midAngle - 90;
        let xPos = base_xPos;
        let textAnchor = 'end';

        // 視認性向上のための反転処理（左半分の文字を読みやすくする）
        if (midAngle > 90 && midAngle < 270) {
            rotation += 180;
            xPos = 100 - base_xPos;
            textAnchor = 'start';
        }

        textElement.setAttribute('x', xPos);
        textElement.setAttribute('y', '50');
        textElement.setAttribute('transform', `rotate(${rotation}, 50, 50)`);
        textElement.setAttribute('text-anchor', textAnchor);
        textElement.style.fontSize = fontSize + 'px';
        textElement.textContent = text.length > 15 ? text.substring(0, 14) + '..' : text;

        group.appendChild(textElement);
    });
}

function createArc(cx, cy, r, start, end) {
    const s = polarToCartesian(cx, cy, r, end);
    const e = polarToCartesian(cx, cy, r, start);
    const flag = end - start <= 180 ? '0' : '1';
    return ['M', cx, cy, 'L', s.x, s.y, 'A', r, r, 0, flag, 0, e.x, e.y, 'Z'].join(' ');
}

function polarToCartesian(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180.0;
    return { x: cx + (r * Math.cos(rad)), y: cy + (r * Math.sin(rad)) };
}

function spin() {
    if (items.length === 0 || isSpinning) return;
    isSpinning = true;
    document.getElementById('spin-btn').disabled = true;

    const rand = mulberry32(Date.now());
    const extra = Math.floor(rand() * 360);
    currentRotation += (360 * 10) + extra;
    document.getElementById('wheel-svg').style.transform = `rotate(${currentRotation}deg)`;

    setTimeout(() => {
        const actual = (360 - (currentRotation % 360)) % 360;
        const idx = Math.floor(actual / (360 / items.length));
        selectedItem = items[idx];

        document.getElementById('hit-item').innerText = selectedItem;
        resultModal.show();
        isSpinning = false;
    }, 5100);
}

function closeModal() {
    resultModal.hide();
    document.getElementById('spin-btn').disabled = false;
}

function closeAndSpin() {
    closeModal();
    spin();
}

document.addEventListener('DOMContentLoaded', loadApp);
