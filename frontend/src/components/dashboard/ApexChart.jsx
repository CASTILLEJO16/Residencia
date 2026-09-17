import { useMemo } from 'react';
import Chart from 'react-apexcharts';

/**
 * Paleta de las graficas. Deliberadamente fria y de baja saturacion: el
 * rojo y el ambar quedan reservados para las severidades, asi una serie
 * nunca se confunde con una alerta.
 */
const SERIES_COLORS = ['#1F5F8B', '#5A8CA8', '#2F7A55', '#7A6BA8', '#8A97A6', '#3E7CB1'];

const BASE = {
  chart: {
    fontFamily: '"Source Sans 3", system-ui, sans-serif',
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: false },
    parentHeightOffset: 0,
  },
  grid: {
    borderColor: '#E5EAF0',
    strokeDashArray: 0,
    padding: { top: 0, right: 8, bottom: 0, left: 4 },
  },
  dataLabels: { enabled: false },
  legend: {
    position: 'bottom',
    horizontalAlign: 'left',
    fontSize: '12px',
    markers: { size: 6, shape: 'square' },
    itemMargin: { horizontal: 8 },
  },
  tooltip: { theme: 'light', style: { fontSize: '12px' } },
  xaxis: {
    labels: { style: { colors: '#5A6B7C', fontSize: '11px' }, rotate: 0, hideOverlappingLabels: true },
    axisBorder: { color: '#D3DAE3' },
    axisTicks: { color: '#D3DAE3' },
  },
  yaxis: {
    labels: {
      style: { colors: '#5A6B7C', fontSize: '11px' },
      formatter: (v) => (typeof v === 'number' ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, notation: 'compact' }).format(v) : v),
    },
  },
  colors: SERIES_COLORS,
};

function merge(...objects) {
  return objects.reduce((acc, obj) => {
    for (const [key, value] of Object.entries(obj || {})) {
      acc[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge(acc[key] || {}, value)
        : value;
    }
    return acc;
  }, {});
}

export default function ApexChart({ type, series, categories, labels, height = 220, extra }) {
  const options = useMemo(() => {
    const byType = {
      line:  { stroke: { curve: 'straight', width: 2 }, markers: { size: 0, hover: { size: 4 } } },
      area:  { stroke: { curve: 'straight', width: 2 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } } },
      bar:   { plotOptions: { bar: { columnWidth: '58%', borderRadius: 1 } } },
      pie:   { labels: labels || [], legend: { position: 'right' }, stroke: { width: 1, colors: ['#FFFFFF'] } },
      donut: { labels: labels || [] },
      radialBar: {
        plotOptions: {
          radialBar: {
            hollow: { size: '62%' },
            track: { background: '#E5EAF0' },
            dataLabels: {
              name: { show: false },
              value: { fontSize: '26px', fontWeight: 600, color: '#16202C', offsetY: 8 },
            },
          },
        },
      },
    };

    return merge(
      BASE,
      { chart: { type }, xaxis: categories ? { categories } : {} },
      byType[type] || {},
      extra || {}
    );
  }, [type, categories, labels, extra]);

  return <Chart type={type} options={options} series={series} height={height} />;
}

