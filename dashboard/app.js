// ==========================================
// TerraCompute Dashboard Logic
// ==========================================

// Error handling utility
function logError(context, error) {
  console.error(`[TerraCompute Error] ${context}:`, error);
}

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
  try {
    initChart();
    renderQueue();
    updateUI();
    
    // Start simulation loop (every 2 seconds = 1 simulator tick)
    setInterval(simulatorTick, 2000);
    
    // Setup button listener
    const btnOverride = document.getElementById("btn-manual-override");
    if (btnOverride) {
      btnOverride.addEventListener("click", triggerManualVPP);
    } else {
      logError("DOMContentLoaded", "Manual override button not found");
    }
  } catch (error) {
    logError("DOMContentLoaded", error);
  }
});

// Initialize Chart.js
function initChart() {
  try {
    const chartCanvas = document.getElementById('chart-carbon-workload');
    
    if (!chartCanvas) {
      logError("initChart", "Chart canvas element not found");
      return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    
    if (!ctx) {
      logError("initChart", "Failed to get 2D context from canvas");
      return;
    }
    
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
  } catch (error) {
    logError("initChart", error);
  }
}

// Render Job Queue List
function renderQueue() {
  try {
    const container = document.getElementById("queue-list-container");
    
    if (!container) {
      logError("renderQueue", "Queue list container not found");
      return;
    }
    
    container.innerHTML = "";
    
    state.aiJobs.forEach(job => {
      try {
        const item = document.createElement("div");
        item.className = "queue-item";
        item.setAttribute("role", "listitem");
        
        let statusClass = "status-active";
        if (job.status === "Paused") statusClass = "status-paused";
        if (job.status === "Rescheduled") statusClass = "status-shifted";
        
        item.innerHTML = `
          <div class="job-info">
            <span class="job-name">${job.name}</span>
            <span class="job-meta">Demand: ${job.load} MW | Priority: ${job.priority} | Time Left: ${job.duration}m</span>
          </div>
          <span class="job-status-pill ${statusClass}" aria-label="Job status: ${job.status}">${job.status}</span>
        `;
        
        container.appendChild(item);
      } catch (error) {
        logError("renderQueue - job iteration", error);
      }
    });
  } catch (error) {
    logError("renderQueue", error);
  }
}

// Trigger manual override for VPP Peak Export
function triggerManualVPP() {
  try {
    state.isManualOverride = true;
    state.overrideTicksRemaining = 15; // 30 seconds of override
    state.systemMode = 'VPP Peak Export';
    
    // Spikes carbon intensity simulation to match a peak grid crisis
    // Value of 512 g/kWh represents extreme grid stress (coal-heavy backup activation)
    state.carbonIntensity = 512; 
    
    updateOrchestratorAlgorithm();
    updateEnergyBalance();
    updateUI();
    
    // Temporary button feedback
    const btn = document.getElementById("btn-manual-override");
    if (btn) {
      btn.disabled = true;
      btn.innerText = "VPP Active Grid-Support...";
    }
  } catch (error) {
    logError("triggerManualVPP", error);
  }
}

// Main simulator tick called every 2 seconds
function simulatorTick() {
  try {
    // 1. Update countdown of manual override
    if (state.isManualOverride) {
      state.overrideTicksRemaining--;
      if (state.overrideTicksRemaining <= 0) {
        state.isManualOverride = false;
        const btn = document.getElementById("btn-manual-override");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Trigger Peak VPP Export
          `;
        }
      }
    }

    // 2. Simulate diurnal or random walk grid carbon fluctuations
    // Bias of 0.48 creates slight upward pressure on carbon intensity to test scheduler limits
    if (!state.isManualOverride) {
      const randomWalk = (Math.random() - 0.48) * 40;
      state.carbonIntensity = Math.max(120, Math.min(580, Math.round(state.carbonIntensity + randomWalk)));
    }

    // 3. Tick durations of active jobs & simulate replacement
    state.aiJobs.forEach(job => {
      try {
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
      } catch (error) {
        logError("simulatorTick - job update", error);
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
      try {
        carbonWorkloadChart.update();
      } catch (error) {
        logError("simulatorTick - chart update", error);
      }
    }

    // 7. Update all DOM metrics and visuals
    renderQueue();
    updateUI();
  } catch (error) {
    logError("simulatorTick", error);
  }
}

// Carbon-Aware Scheduling Algorithm
// Grid thresholds: < 180 (clean), 180-280 (balanced), 280-420 (moderate stress), >= 420 (critical)
function updateOrchestratorAlgorithm() {
  try {
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
      try {
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
      } catch (error) {
        logError("updateOrchestratorAlgorithm - job scheduling", error);
      }
    });
  } catch (error) {
    logError("updateOrchestratorAlgorithm", error);
  }
}

// Calculate Microgrid energy flows, battery storage, and VPP exports
function updateEnergyBalance() {
  try {
    // Sum up active workloads load
    const activeLoad = state.aiJobs
      .filter(job => job.status === "Active")
      .reduce((sum, job) => sum + job.load, 0);
    
    // Baseline system load is 12 MW (cooling, security, basic operations)
    state.datacenterLoad = activeLoad + 12.0; 

    const netPower = state.totalOnsiteGen - state.datacenterLoad;
    
    // Time step duration: 2 seconds = 1/1800 of an hour
    // Energy exported = Power (MW) × Time (hours) = Power × (2s / 3600s/hr)
    const timeStepHours = 2 / 3600;
    
    if (state.systemMode === 'VPP Peak Export') {
      // Peak energy discharge: dump battery + generation into grid
      state.batteryPowerFlow = -15.0; // discharge max rate (15MW) to support town
      state.batterySoc = Math.max(10, state.batterySoc - 1.2); // discharge battery SoC
      state.gridExport = netPower - state.batteryPowerFlow; // positive export
      
      // Accumulate total export count (convert MW to MWh using time step)
      state.cumulativeExportMWh = parseFloat((state.cumulativeExportMWh + (state.gridExport * timeStepHours)).toFixed(1));
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
  } catch (error) {
    logError("updateEnergyBalance", error);
  }
}

// Update DOM elements
function updateUI() {
  try {
    // Metric Ribbon
    const computeLoadEl = document.getElementById("metric-compute-load");
    if (computeLoadEl) {
      computeLoadEl.innerText = `${state.datacenterLoad.toFixed(1)} MW`;
    }
    
    const intensityEl = document.getElementById("metric-carbon-intensity");
    if (intensityEl) {
      intensityEl.innerText = `${state.carbonIntensity} g/kWh`;
    }
    
    const trendEl = document.getElementById("metric-carbon-trend");
    const iconEl = document.getElementById("grid-carbon-icon");
    
    // Set Carbon Visual Indicators
    if (state.carbonIntensity >= 420) {
      if (trendEl) {
        trendEl.innerText = "CRITICAL GRID CRISIS";
        trendEl.className = "metric-trend red animate-pulse";
        trendEl.setAttribute("aria-label", "Grid status: Critical");
      }
      if (iconEl) {
        iconEl.className = "metric-icon red";
        iconEl.setAttribute("aria-label", "Critical grid indicator");
      }
    } else if (state.carbonIntensity >= 280) {
      if (trendEl) {
        trendEl.innerText = "Moderate Grid Load";
        trendEl.className = "metric-trend yellow";
        trendEl.setAttribute("aria-label", "Grid status: Moderate");
      }
      if (iconEl) {
        iconEl.className = "metric-icon yellow";
        iconEl.setAttribute("aria-label", "Moderate grid indicator");
      }
    } else {
      if (trendEl) {
        trendEl.innerText = "Abundant Clean Grid";
        trendEl.className = "metric-trend green";
        trendEl.setAttribute("aria-label", "Grid status: Abundant clean energy");
      }
      if (iconEl) {
        iconEl.className = "metric-icon green";
        iconEl.setAttribute("aria-label", "Clean grid indicator");
      }
    }

    // Header Mode status
    const modeText = document.getElementById("system-status-text");
    const statusIndicator = document.getElementById("system-status-indicator");
    const orchestratorBadge = document.getElementById("orchestrator-perf-badge");
    const microgridBadge = document.getElementById("microgrid-vpp-badge");
    
    if (state.systemMode === 'VPP Peak Export') {
      if (modeText) modeText.innerText = "VPP Active Grid-Support";
      if (statusIndicator) statusIndicator.className = "system-status warning";
      if (orchestratorBadge) {
        orchestratorBadge.innerText = "Job Shedding: Active";
        orchestratorBadge.className = "badge badge-green";
      }
      if (microgridBadge) {
        microgridBadge.innerText = "Grid Support: Maximum";
        microgridBadge.className = "badge badge-green";
      }
    } else {
      if (modeText) modeText.innerText = "Grid-Balanced Mode";
      if (statusIndicator) statusIndicator.className = "system-status active";
      if (orchestratorBadge) {
        orchestratorBadge.innerText = "98.5% Compute Efficiency";
        orchestratorBadge.className = "badge badge-cyan";
      }
      
      if (microgridBadge) {
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
    }

    // Siting / Flow section stats updates
    const dcLoadEl = document.getElementById("val-datacenter-load");
    if (dcLoadEl) {
      dcLoadEl.innerText = `${state.datacenterLoad.toFixed(1)} MW`;
    }
    
    const bVal = document.getElementById("val-battery");
    const bLabel = document.getElementById("label-battery");
    const bLane = document.getElementById("flow-lane-battery");
    
    if (state.batteryPowerFlow > 0.2) {
      if (bVal) bVal.innerText = `Charging (+${state.batteryPowerFlow.toFixed(1)} MW)`;
      if (bLabel) bLabel.innerText = "Charging";
      if (bLane) bLane.className = "flow-lane lane-battery active-flow";
    } else if (state.batteryPowerFlow < -0.2) {
      if (bVal) bVal.innerText = `Discharging (${state.batteryPowerFlow.toFixed(1)} MW)`;
      if (bLabel) bLabel.innerText = "Discharging";
      if (bLane) bLane.className = "flow-lane lane-battery active-flow";
    } else {
      if (bVal) bVal.innerText = "Standby (0.0 MW)";
      if (bLabel) bLabel.innerText = "Standby";
      if (bLane) bLane.className = "flow-lane lane-battery";
    }
    
    const gVal = document.getElementById("val-external-grid");
    const gLabel = document.getElementById("label-grid");
    const gLane = document.getElementById("flow-lane-grid");
    
    if (state.gridExport > 0.2) {
      if (gVal) {
        gVal.innerText = `+${state.gridExport.toFixed(1)} MW`;
        gVal.className = "dest-val text-green";
      }
      if (gLabel) gLabel.innerText = "VPP Exporting";
      if (gLane) gLane.className = "flow-lane lane-grid active-flow";
    } else if (state.gridExport < -0.2) {
      if (gVal) {
        gVal.innerText = `${state.gridExport.toFixed(1)} MW`;
        gVal.className = "dest-val text-red";
      }
      if (gLabel) gLabel.innerText = "Importing Draw";
      if (gLane) gLane.className = "flow-lane lane-grid active-flow";
    } else {
      if (gVal) {
        gVal.innerText = "Balanced (0.0 MW)";
        gVal.className = "dest-val";
      }
      if (gLabel) gLabel.innerText = "Zero Net Draw";
      if (gLane) gLane.className = "flow-lane lane-grid";
    }
    
    // Battery indicators
    const batteryProgress = document.getElementById("battery-progress");
    if (batteryProgress) {
      batteryProgress.style.width = `${Math.round(state.batterySoc)}%`;
      batteryProgress.setAttribute("aria-valuenow", Math.round(state.batterySoc));
    }
    
    const batteryPercent = document.getElementById("stat-battery-percent");
    if (batteryPercent) {
      batteryPercent.innerText = `${Math.round(state.batterySoc)}%`;
    }
    
    // Grid support indicators
    const gridExportEl = document.getElementById("stat-grid-export");
    if (gridExportEl) {
      gridExportEl.innerText = state.gridExport > 0.1 
        ? `+${state.gridExport.toFixed(1)} MW (Exporting)` 
        : state.gridExport < -0.1 
        ? `${state.gridExport.toFixed(1)} MW (Importing)` 
        : `0.0 MW (Balanced)`;
    }
    
    const totalExportEl = document.getElementById("stat-total-export-today");
    if (totalExportEl) {
      totalExportEl.innerText = `${state.cumulativeExportMWh.toFixed(1)} MWh`;
    }
    
    // Community glow pulse update
    const commGlow = document.getElementById("community-offset-glow");
    if (commGlow) {
      if (state.gridExport > 0) {
        commGlow.className = "fact-status green-glow animate-pulse";
      } else {
        commGlow.className = "fact-status";
      }
    }
  } catch (error) {
    logError("updateUI", error);
  }
}

// Helpers
function getRandomJobName() {
  try {
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
  } catch (error) {
    logError("getRandomJobName", error);
    return "Unknown Job";
  }
}
