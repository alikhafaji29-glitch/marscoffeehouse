import type { Nutrient } from './store'
import type { SKey } from './strings'

/* the nutrition fields' units and labels, shared by the dashboard's Edit Item page and the customer's item page */
export const nutrientUnit: Record<Nutrient, string> = { energy: 'kcal', fat: 'g', satFat: 'g', carbs: 'g', sugar: 'g', fibre: 'g', protein: 'g', salt: 'g', caffeine: 'mg' }
export const nutrientLabel: Record<Nutrient, SKey> = { energy: 'nEnergy', fat: 'nFat', satFat: 'nSatFat', carbs: 'nCarbs', sugar: 'nSugar', fibre: 'nFibre', protein: 'nProtein', salt: 'nSalt', caffeine: 'nCaffeine' }
