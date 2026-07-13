// Final Whistle — shared interactions

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasViewTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // Scroll reveal fallback — only needed where the browser can't do it in pure CSS
  if (!reduceMotion && !hasViewTimeline && 'IntersectionObserver' in window) {
    document.body.classList.add('js-reveal');
    var revealTargets = document.querySelectorAll('.feature, .step, .receipt');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  // Count-up animation for the stat strip (numbers are already correct in the HTML,
  // this only adds the counting motion — nothing breaks if it doesn't run)
  var stats = document.querySelectorAll('.stat .num');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.textContent.trim(), 10);
        if (isNaN(target)) return;
        var duration = 900;
        var startTime = null;

        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          el.textContent = Math.floor(progress * target);
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target;
        }
        requestAnimationFrame(step);
        statObserver.unobserve(el);
      });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { statObserver.observe(el); });
  }
})();

// Wallet connection — works with any wallet injecting window.solana
// (Phantom, Solflare, Backpack, and most others follow this same standard).
// No external library needed for a simple connect/disconnect flow.
(function () {
  var btn = document.getElementById('connectWalletBtn');
  if (!btn) return;

  var connectedAddress = null;

  function getProvider() {
    return window.solana || window.solflare || window.backpack || null;
  }

  function shortenAddress(addr) {
    return addr.slice(0, 4) + '\u2026' + addr.slice(-4);
  }

  function setConnectedUI(address) {
    connectedAddress = address;
    btn.textContent = shortenAddress(address);
    btn.classList.add('wallet-connected');
    btn.title = 'Connected: ' + address + ' (click to disconnect)';
  }

  function setDisconnectedUI() {
    connectedAddress = null;
    btn.textContent = 'Connect wallet';
    btn.classList.remove('wallet-connected');
    btn.title = '';
  }

  async function connectWallet() {
    var provider = getProvider();

    if (!provider) {
      window.open('https://phantom.app/', '_blank', 'noopener');
      return;
    }

    var originalText = btn.textContent;
    try {
      btn.textContent = 'Connecting\u2026';
      var resp = await provider.connect();
      setConnectedUI(resp.publicKey.toString());
    } catch (err) {
      console.error('Wallet connection failed or was rejected:', err);
      btn.textContent = originalText;
    }
  }

  function disconnectWallet() {
    var provider = getProvider();
    if (provider && typeof provider.disconnect === 'function') {
      provider.disconnect();
    }
    setDisconnectedUI();
  }

  btn.addEventListener('click', function () {
    if (connectedAddress) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  });

  // Silently try to restore a previously-trusted connection after a page
  // refresh. onlyIfTrusted means this never pops up a prompt — it just
  // resolves quietly if the site was already approved, or fails quietly
  // if not (which is expected and not an error).
  (async function tryEagerConnect() {
    var provider = getProvider();
    if (!provider) return;
    try {
      var resp = await provider.connect({ onlyIfTrusted: true });
      setConnectedUI(resp.publicKey.toString());
    } catch (err) {
      // Not previously trusted — normal, just stay disconnected until clicked.
    }
  })();
})();

// Market stake buttons (markets.html) — honest demo feedback, real staking
// wires to the deployed Anchor program in the next build.
// Market stake buttons (markets.html) — builds and sends a REAL on-chain
// stake transaction to our deployed devnet program when the wallet is
// connected. Falls back to an honest prompt if not connected.
(function () {
  var sideButtons = document.querySelectorAll('.side-btn');
  if (!sideButtons.length) return;

  var PROGRAM_ID_STR = 'GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji';
  var DEVNET_RPC = 'https://api.devnet.solana.com';
  var LAMPORTS_PER_SOL = 1000000000;

  // Anchor discriminator for our program's `stake` instruction
  // (first 8 bytes of sha256("global:stake"))
  var STAKE_DISCRIMINATOR = new Uint8Array([206, 176, 202, 18, 200, 209, 179, 108]);

  // Must exactly match the fixtures created by init_markets.ts
  var MARKET_CONFIG = {
    'England': { fixtureId: 3, side: 0 },
    'Draw': { fixtureId: 3, side: 1 },
    'Argentina': { fixtureId: 3, side: 2 },
    'Over 2.5': { fixtureId: 4, side: 0 },
    'Under 2.5': { fixtureId: 4, side: 1 },
  };

  function isWalletConnected() {
    var walletBtn = document.getElementById('connectWalletBtn');
    return walletBtn && walletBtn.classList.contains('wallet-connected');
  }

  function getProvider() {
    return window.solana || window.solflare || window.backpack || null;
  }

  function u64Bytes(amount) {
    var buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(amount), true);
    return buf;
  }

  function concatBytes(arrays) {
    var total = arrays.reduce(function (sum, a) { return sum + a.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    arrays.forEach(function (a) { result.set(a, offset); offset += a.length; });
    return result;
  }

  async function realStake(side, amountSol, note) {
    if (typeof solanaWeb3 === 'undefined') {
      note.textContent = 'Solana library did not load \u2014 check your connection and refresh.';
      return;
    }
    var marketConfig = MARKET_CONFIG[side];
    if (!marketConfig) {
      note.textContent = 'Unknown market side.';
      return;
    }
    if (!amountSol || isNaN(amountSol) || amountSol <= 0) {
      note.textContent = 'Enter a valid stake amount above 0.';
      return;
    }
    var provider = getProvider();
    if (!provider || !provider.publicKey) {
      note.textContent = 'Connect your wallet above first.';
      return;
    }

    try {
      note.textContent = 'Building transaction\u2026';

      var programId = new solanaWeb3.PublicKey(PROGRAM_ID_STR);
      var connection = new solanaWeb3.Connection(DEVNET_RPC, 'confirmed');

      var fixtureIdBuf = u64Bytes(marketConfig.fixtureId);
      var marketSeed = [new TextEncoder().encode('market'), fixtureIdBuf];
      var marketPda = solanaWeb3.PublicKey.findProgramAddressSync(marketSeed, programId)[0];
      var vaultSeed = [new TextEncoder().encode('vault'), marketPda.toBuffer()];
      var vaultPda = solanaWeb3.PublicKey.findProgramAddressSync(vaultSeed, programId)[0];
      var positionSeed = [new TextEncoder().encode('position'), marketPda.toBuffer(), provider.publicKey.toBuffer()];
      var positionPda = solanaWeb3.PublicKey.findProgramAddressSync(positionSeed, programId)[0];

      var amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
      var data = concatBytes([
        STAKE_DISCRIMINATOR,
        new Uint8Array([marketConfig.side]),
        u64Bytes(amountLamports),
      ]);

      var ix = new solanaWeb3.TransactionInstruction({
        programId: programId,
        keys: [
          { pubkey: provider.publicKey, isSigner: true, isWritable: true },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: data,
      });

      var tx = new solanaWeb3.Transaction().add(ix);
      var latestBlockhash = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = provider.publicKey;

      note.textContent = 'Approve the transaction in your wallet\u2026';

      var txSig;
      if (provider.signAndSendTransaction) {
        var result = await provider.signAndSendTransaction(tx);
        txSig = result.signature || result;
      } else {
        var signedTx = await provider.signTransaction(tx);
        txSig = await connection.sendRawTransaction(signedTx.serialize());
      }

      note.innerHTML = 'Staked ' + amountSol + ' SOL on "' + side + '". <a href="https://explorer.solana.com/tx/' +
        txSig + '?cluster=devnet" target="_blank" rel="noopener">View transaction</a> (confirming\u2026)';

      await connection.confirmTransaction({
        signature: txSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      note.innerHTML = 'Staked ' + amountSol + ' SOL on "' + side + '". <a href="https://explorer.solana.com/tx/' +
        txSig + '?cluster=devnet" target="_blank" rel="noopener">View confirmed transaction</a>';
    } catch (err) {
      console.error('Stake failed:', err);
      var message = (err && err.message) ? err.message : 'see browser console for details';
      note.textContent = 'Stake failed: ' + message;
    }
  }

  sideButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.market-card');
      var note = card ? card.querySelector('[data-note]') : null;
      var amountInput = card ? card.querySelector('.stake-amount') : null;
      if (!note) return;
      var side = btn.getAttribute('data-side');
      var amountSol = amountInput ? parseFloat(amountInput.value) : 0.01;

      if (isWalletConnected()) {
        realStake(side, amountSol, note);
      } else {
        note.textContent = 'Connect your wallet above to stake on "' + side + '".';
      }
    });
  });
})();

// My Positions — reads real on-chain StakePosition accounts for the
// connected wallet across our known markets. Not a database — this is
// exactly the same account layout our Anchor program writes to.
(function () {
  var refreshBtn = document.getElementById('refreshPositionsBtn');
  var positionsList = document.getElementById('positionsList');
  if (!refreshBtn || !positionsList) return;

  var PROGRAM_ID_STR = 'GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji';
  var DEVNET_RPC = 'https://api.devnet.solana.com';
  var LAMPORTS_PER_SOL = 1000000000;

  var MARKETS = [
    { fixtureId: 3, label: 'England vs Argentina', sides: ['England', 'Draw', 'Argentina'] },
    { fixtureId: 4, label: 'France vs Spain (O/U 2.5)', sides: ['Over 2.5', 'Under 2.5'] },
  ];

  function u64BytesLocal(n) {
    var buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(n), true);
    return buf;
  }

  async function fetchPositions() {
    if (typeof solanaWeb3 === 'undefined') {
      positionsList.innerHTML = '<p class="no-positions">Solana library did not load \u2014 refresh the page.</p>';
      return;
    }
    var provider = window.solana || window.solflare || window.backpack;
    if (!provider || !provider.publicKey) {
      positionsList.innerHTML = '<p class="no-positions">Connect your wallet above first.</p>';
      return;
    }

    positionsList.innerHTML = '<p class="no-positions">Loading\u2026</p>';

    var programId = new solanaWeb3.PublicKey(PROGRAM_ID_STR);
    var connection = new solanaWeb3.Connection(DEVNET_RPC, 'confirmed');
    var rows = [];

    for (var i = 0; i < MARKETS.length; i++) {
      var m = MARKETS[i];
      try {
        var fixtureIdBuf = u64BytesLocal(m.fixtureId);
        var marketPda = solanaWeb3.PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('market'), fixtureIdBuf], programId
        )[0];
        var positionPda = solanaWeb3.PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('position'), marketPda.toBuffer(), provider.publicKey.toBuffer()], programId
        )[0];

        var accInfo = await connection.getAccountInfo(positionPda);
        if (!accInfo || !accInfo.data) continue;

        var data = accInfo.data;
        // Layout: 8 discriminator + 32 market + 32 staker + 1 side + 8 amount + 1 claimed + 1 bump
        var side = data[72];
        var amountView = new DataView(data.buffer, data.byteOffset + 73, 8);
        var amountLamports = amountView.getBigUint64(0, true);
        var claimed = data[81] === 1;
        var amountSol = Number(amountLamports) / LAMPORTS_PER_SOL;

        rows.push({
          market: m.label,
          side: m.sides[side] || ('Side ' + side),
          amountSol: amountSol,
          claimed: claimed,
        });
      } catch (err) {
        console.error('Could not read position for', m.label, err);
      }
    }

    if (rows.length === 0) {
      positionsList.innerHTML = '<p class="no-positions">No positions yet \u2014 stake on a market above, then refresh here.</p>';
      return;
    }

    positionsList.innerHTML = rows.map(function (p) {
      var status = p.claimed ? 'Claimed' : 'Open \u2014 settles when the match ends';
      return '<div class="position-row">' +
        '<span><span class="pos-market">' + p.market + '</span><span class="pos-side">' + p.side + '</span></span>' +
        '<span class="pos-amount">' + p.amountSol + ' SOL</span>' +
        '<span class="pos-status">' + status + '</span>' +
        '</div>';
    }).join('');
  }

  refreshBtn.addEventListener('click', fetchPositions);
})();
