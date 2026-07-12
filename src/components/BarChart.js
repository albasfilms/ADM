import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export function renderBarChart(canvas, labels, data, label) {
  const isMobile = window.innerWidth < 640;
  const tickSize = isMobile ? 10 : 12;

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data: data.map((v) => v / 100),
          backgroundColor: 'rgba(200, 169, 110, 0.7)',
          borderColor: 'rgba(200, 169, 110, 1)',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                ctx.raw
              ),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: isMobile ? 45 : 0,
            minRotation: isMobile ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: isMobile ? 4 : 6,
            font: { size: tickSize },
          },
          grid: {
            display: !isMobile,
          },
        },
        y: {
          ticks: {
            maxTicksLimit: isMobile ? 4 : 6,
            font: { size: tickSize },
            callback: (v) =>
              new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
                notation: isMobile ? 'compact' : 'standard',
              }).format(v),
          },
        },
      },
    },
  });
}
