// ==========================================
// TerraCompute Dashboard Logic
// ==========================================

// Global App State
const state = {
  // Power & Grid
  smrOutput: 50.0,          // constant MW
  geothermalOutput: 20.0,   // constant MW
  totalOnsiteGen: 70.0,     // sum of above
  datacenterLoad: 48.2,     // variable MW
  batterySoc: 74,           // % (State of Charge)
  batteryMaxCap: 100,       // MWh
  batteryPowerFlow: 15.8,   // MW (+ charging, - discharging)
  gridExport: 6.0,          // MW (+ export, - import)
  cumulativeExportMWh: 32.4, // MWh exported today
  carbonIntensity: 342,     // gCO2/kWh
  
  // Controls
  isManualOverride: false,  // whether user forced VPP mode
  overrideTicksRemaining: 0,
  systemMode: 'Grid-Balanced', // 'Grid-Balanced', 'VPP Peak Export', 'Islanding'
  
  // Workload Queue
  aiJobs: [
    { id: 1, name: "Llama-3 70B Fine-tuning", load: 22.5, priority: "Standard", status: "Active", duration: 40 },
    { id: 2, name: "ResNet-152 Pre-training", load: 15.0, priority: "Low", status: "Active", duration: 60 },
    { id: 3, name: "Clinical Trials NLP Model", load: 10.7, priority: "Critical", status: "Active", duration: 25 },
    { id: 4, name: "Protein Folding Analysis", load: 18.0, priority: "Low", status: "Paused", duration: 80 },
    { id: 5, name: "Autonomous Vehicle Vision Sync", load: 12.0, priority: "Standard", status: "Paused", duration: 50 }
  ],
  
  // Chart Tracking Data
  chartData: {
    labels: Array.from({length: 15}, (_, i) => `-${(15-i)*2}s`),
    carbonHistory: [280, 290, 310, 315, 330, 325, 342, 340, 342, 341, 338, 342, 340, 345, 342],
    computeHistory: [40, 42, 45, 45, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48]
  }
};

let carbonWorkloadChart = null;

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  renderQueue();
  updateUI();
  
  // Start simulation loop (every 2 seconds = 1 simulator tick)
  setInterval(simulatorTick, 2000);
  
  // Setup button listener
  const btnOverride = document.getElementById("btn-manual-override");
  btnOverride.addEventListener("click", triggerManualVPP);
});

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('chart-carbon-workload').getContext('2d');
  
  carbonWorkloadChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: state.chartData.labels,
      datasets: [
        {
          label: 'Grid Carbon Intensity (g/kWh)',
          data: state.chartData.carbonHistory,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          borderWidth: 2,
          yAxisID: 'y-carbon',
          tension: 0.3,
          fill: true
        },
        {
          label: 'AI Data Center Load (MW)',
          data: state.chartData.computeHistory,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.05)',
          borderWidth: 2,
          yAxisID: 'y-compute',
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#f9fafb',
            font: { family: 'Outfit', size: 11 }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        },
        'y-carbon': {
          type: 'linear',
          position: 'left',
          min: 100,
          max: 600,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#f59e0b',
            font: { family: 'Fira Code' },
            callback: (val) => `${val}g`
          },
          title: {
            display: true,
            text: 'gCO2 / kWh',
            color: '#f59e0b',
            font: { family: 'Outfit' }
          }
        },
        'y-compute': {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 80,
          grid: { drawOnChartArea: false }, // avoid grid line overlaps
          ticks: {
            color: '#06b6d4',
            font: { family: 'Fira Code' },
            callback: (val) => `${val} MW`
          },
          title: {
            display: true,
            text: 'Megawatts (MW)',
            color: '#06b6d4',
            font: { family: 'Outfit' }
          }
        }
      }
    }
  });
}

// Render Job Queue List
function renderQueue() {
  const container = document.getElementById("queue-list-container");
  container.innerHTML = "";
  
  state.aiJobs.forEach(job => {
    const item = document.createElement("div");
    item.className = "queue-item";
    
    let statusClass = "status-active";
    if (job.status === "Paused") statusClass = "status-paused";
    if (job.status === "Rescheduled") statusClass = "status-shifted";
    
    item.innerHTML = `
      <div class="job-info">
        <span class="job-name">${job.name}</span>
        <span class="job-meta">Demand: ${job.load} MW | Priority: ${job.priority} | Time Left: ${job.duration}m</span>
      </div>
      <span class="job-status-pill ${statusClass}">${job.status}</span>
    `;
    
    container.appendChild(item);
  });
}

// Trigger manual override for VPP Peak Export
function triggerManualVPP() {
  state.isManualOverride = true;
  state.overrideTicksRemaining = 15; // 30 seconds of override
  state.systemMode = 'VPP Peak Export';
  
  // Spikes carbon intensity simulation to match a peak grid crisis
  state.carbonIntensity = 512; 
  
  updateOrchestratorAlgorithm();
  updateEnergyBalance();
  updateUI();
  
  // Temporary button feedback
  const btn = document.getElementById("btn-manual-override");
  btn.disabled = true;
  btn.innerText = "VPP Active Grid-Support...";
}

// Main simulator tick called every 2 seconds
function simulatorTick() {
  // 1. Update countdown of manual override
  if (state.isManualOverride) {
    state.overrideTicksRemaining--;
    if (state.overrideTicksRemaining <= 0) {
      state.isManualOverride = false;
      const btn = document.getElementById("btn-manual-override");
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        Trigger Peak VPP Export
      `;
    }
  }

  // 2. Simulate diurnal or random walk grid carbon fluctuations
  if (!state.isManualOverride) {
    const change = (Math.random() - 0.48) * 40; // upward bias for testing scheduler limits
    state.carbonIntensity = Math.max(120, Math.min(580, Math.round(state.carbonIntensity + change)));
  }

  // 3. Tick durations of active jobs & simulate replacement
  state.aiJobs.forEach(job => {
    if (job.status === "Active") {
      job.duration = Math.max(0, job.duration - 2);
      if (job.duration <= 0) {
        // Replace finished job with a fresh random job
        job.name = getRandomJobName();
        job.duration = Math.round(30 + Math.random() * 60);
        job.load = parseFloat((10 + Math.random() * 18).toFixed(1));
        job.priority = ["Low", "Standard", "Critical"][Math.floor(Math.random() * 3)];
        job.status = "Active";
      }
    }
  });

  // 4. Run Workload Orchestrator Decisions
  updateOrchestratorAlgorithm();

  // 5. Update Energy Balance / Battery / VPP Exports
  updateEnergyBalance();

  // 6. Push history data to Chart
  state.chartData.carbonHistory.shift();
  state.chartData.carbonHistory.push(state.carbonIntensity);
  state.chartData.computeHistory.shift();
  state.chartData.computeHistory.push(parseFloat(state.datacenterLoad.toFixed(1)));
  
  if (carbonWorkloadChart) {
    carbonWorkloadChart.update();
  }

  // 7. Update all DOM metrics and visuals
  renderQueue();
  updateUI();
}

// Carbon-Aware Scheduling Algorithm
function updateOrchestratorAlgorithm() {
  // Define grid state limits
  const isHighStress = state.carbonIntensity >= 420 || state.isManualOverride;
  const isModerateStress = state.carbonIntensity >= 280 && state.carbonIntensity < 420;
  
  if (isHighStress) {
    state.systemMode = 'VPP Peak Export';
  } else if (state.carbonIntensity < 180) {
    state.systemMode = 'Grid-Balanced'; // Green abundant state
  } else {
    state.systemMode = 'Grid-Balanced';
  }

  // Set individual job states based on priority and grid conditions
  state.aiJobs.forEach(job => {
    if (job.priority === "Critical") {
      // Critical jobs run under all circumstances (medical, safety AI, sync)
      job.status = "Active";
    } else if (job.priority === "Standard") {
      if (isHighStress) {
        // Shift standard jobs to shed load for grid support
        job.status = "Paused";
      } else {
        job.status = "Active";
      }
    } else if (job.priority === "Low") {
      if (isHighStress || isModerateStress) {
        // Shed low priority jobs immediately on moderate grid strain
        job.status = "Rescheduled";
      } else {
        job.status = "Active";
      }
    }
  });
}

// Calculate Microgrid energy flows, battery storage, and VPP exports
function updateEnergyBalance() {
  // Sum up active workloads load
  const activeLoad = state.aiJobs
    .filter(job => job.status === "Active")
    .reduce((sum, job) => sum + job.load, 0);
  
  // Baseline system load is 20 MW (cooling, security, basic operations)
  state.datacenterLoad = activeLoad + 12.0; 

  const netPower = state.totalOnsiteGen - state.datacenterLoad;
  
  if (state.systemMode === 'VPP Peak Export') {
    // Peak energy discharge: dump battery + generation into grid
    state.batteryPowerFlow = -15.0; // discharge max rate (15MW) to support town
    state.batterySoc = Math.max(10, state.batterySoc - 1.2); // discharge battery SoC
    state.gridExport = netPower - state.batteryPowerFlow; // positive export
    
    // Accumulate total export count (MW for 2s simulator tick ~ MWh equivalents)
    state.cumulativeExportMWh = parseFloat((state.cumulativeExportMWh + (state.gridExport * 0.05)).toFixed(1));
  } else {
    // Standard Balancing:
    // If excess onsite clean energy, charge battery first
    if (netPower > 0) {
      if (state.batterySoc < 98) {
        state.batteryPowerFlow = Math.min(netPower, 15.0); // charge at max 15MW
        state.batterySoc = Math.min(100, state.batterySoc + 0.6); // increase charge
        state.gridExport = netPower - state.batteryPowerFlow;
      } else {
        // Battery full: export remainder of clean generation
        state.batteryPowerFlow = 0;
        state.gridExport = netPower;
      }
    } else {
      // Underpowered (heavy compute vs clean gen): draw from batteries first to avoid grid draw
      const powerShortfall = Math.abs(netPower);
      if (state.batterySoc > 20) {
        state.batteryPowerFlow = -powerShortfall; // discharge to cover shortfall
        state.batterySoc = Math.max(15, state.batterySoc - 0.4);
        state.gridExport = 0; // zero grid import
      } else {
        // Batteries depleted: import shortfall (negative export)
        state.batteryPowerFlow = 0;
        state.gridExport = netPower; // negative (drawn from grid)
      }
    }
  }
}

// Update DOM elements
function updateUI() {
  // Metric Ribbon
  document.getElementById("metric-compute-load").innerText = `${state.datacenterLoad.toFixed(1)} MW`;
  
  const intensityEl = document.getElementById("metric-carbon-intensity");
  intensityEl.innerText = `${state.carbonIntensity} g/kWh`;
  
  const trendEl = document.getElementById("metric-carbon-trend");
  const iconEl = document.getElementById("grid-carbon-icon");
  
  // Set Carbon Visual Indicators
  if (state.carbonIntensity >= 420) {
    trendEl.innerText = "CRITICAL GRID CRISIS";
    trendEl.className = "metric-trend red animate-pulse";
    iconEl.className = "metric-icon red";
  } else if (state.carbonIntensity >= 280) {
    trendEl.innerText = "Moderate Grid Load";
    trendEl.className = "metric-trend yellow";
    iconEl.className = "metric-icon yellow";
  } else {
    trendEl.innerText = "Abundant Clean Grid";
    trendEl.className = "metric-trend green";
    iconEl.className = "metric-icon green";
  }

  // Header Mode status
  const modeText = document.getElementById("system-status-text");
  const statusIndicator = document.getElementById("system-status-indicator");
  const orchestratorBadge = document.getElementById("orchestrator-perf-badge");
  const microgridBadge = document.getElementById("microgrid-vpp-badge");
  
  if (state.systemMode === 'VPP Peak Export') {
    modeText.innerText = "VPP Active Grid-Support";
    statusIndicator.className = "system-status warning";
    orchestratorBadge.innerText = "Job Shedding: Active";
    orchestratorBadge.className = "badge badge-green";
    microgridBadge.innerText = "Grid Support: Maximum";
    microgridBadge.className = "badge badge-green";
  } else {
    modeText.innerText = "Grid-Balanced Mode";
    statusIndicator.className = "system-status active";
    orchestratorBadge.innerText = "98.5% Compute Efficiency";
    orchestratorBadge.className = "badge badge-cyan";
    
    if (state.gridExport > 0.1) {
      microgridBadge.innerText = `Zero Net Draw (Exporting +${state.gridExport.toFixed(1)} MW)`;
      microgridBadge.className = "badge badge-green";
    } else if (state.gridExport < -0.1) {
      microgridBadge.innerText = `Grid-Tied (Drawing ${Math.abs(state.gridExport).toFixed(1)} MW)`;
      microgridBadge.className = "badge badge-cyan";
    } else {
      microgridBadge.innerText = "Zero Net Draw (Isolated)";
      microgridBadge.className = "badge badge-green";
    }
  }

  // Siting / Flow section stats updates
  document.getElementById("val-datacenter-load").innerText = `${state.datacenterLoad.toFixed(1)} MW`;
  
  const bVal = document.getElementById("val-battery");
  const bLabel = document.getElementById("label-battery");
  const bLane = document.getElementById("flow-lane-battery");
  
  if (state.batteryPowerFlow > 0.2) {
    bVal.innerText = `Charging (+${state.batteryPowerFlow.toFixed(1)} MW)`;
    bLabel.innerText = "Charging";
    bLane.className = "flow-lane lane-battery active-flow";
  } else if (state.batteryPowerFlow < -0.2) {
    bVal.innerText = `Discharging (${state.batteryPowerFlow.toFixed(1)} MW)`;
    bLabel.innerText = "Discharging";
    bLane.className = "flow-lane lane-battery active-flow";
  } else {
    bVal.innerText = "Standby (0.0 MW)";
    bLabel.innerText = "Standby";
    bLane.className = "flow-lane lane-battery";
  }
  
  const gVal = document.getElementById("val-external-grid");
  const gLabel = document.getElementById("label-grid");
  const gLane = document.getElementById("flow-lane-grid");
  
  if (state.gridExport > 0.2) {
    gVal.innerText = `+${state.gridExport.toFixed(1)} MW`;
    gVal.className = "dest-val text-green";
    gLabel.innerText = "VPP Exporting";
    gLane.className = "flow-lane lane-grid active-flow";
  } else if (state.gridExport < -0.2) {
    gVal.innerText = `${state.gridExport.toFixed(1)} MW`;
    gVal.className = "dest-val text-red";
    gLabel.innerText = "Importing Draw";
    gLane.className = "flow-lane lane-grid active-flow";
  } else {
    gVal.innerText = "Balanced (0.0 MW)";
    gVal.className = "dest-val";
    gLabel.innerText = "Zero Net Draw";
    gLane.className = "flow-lane lane-grid";
  }
  
  // Battery indicators
  document.getElementById("battery-progress").style.width = `${Math.round(state.batterySoc)}%`;
  document.getElementById("stat-battery-percent").innerText = `${Math.round(state.batterySoc)}%`;
  
  // Grid support indicators
  document.getElementById("stat-grid-export").innerText = state.gridExport > 0.1 
    ? `+${state.gridExport.toFixed(1)} MW (Exporting)` 
    : state.gridExport < -0.1 
    ? `${state.gridExport.toFixed(1)} MW (Importing)` 
    : `0.0 MW (Balanced)`;
    
  document.getElementById("stat-total-export-today").innerText = `${state.cumulativeExportMWh.toFixed(1)} MWh`;
  
  // Community glow pulse update
  const commGlow = document.getElementById("community-offset-glow");
  if (state.gridExport > 0) {
    commGlow.className = "fact-status green-glow animate-pulse";
  } else {
    commGlow.className = "fact-status";
  }
}

// Helpers
function getRandomJobName() {
  const names = [
    "ResNet Image Classification",
    "Transformer Translation Run",
    "Customer Churn XGBoost Training",
    "Weather Patterns Climate Forecast",
    "BERT Sentiment Embedding Sync",
    "Sperm-Cell Motif Synthesis",
    "Molecular Docking Predictor",
    "Synthetic Data Generation Node"
  ];
  return names[Math.floor(Math.random() * names.length)];
}
