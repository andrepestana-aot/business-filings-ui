import Vue from 'vue'
import Vuetify from 'vuetify'
import Vuelidate from 'vuelidate'
import { mount, Wrapper } from '@vue/test-utils'
import { getVuexStore } from '@/store'
import AgmDate from '@/components/AnnualReport/AGMDate.vue'

// suppress "Avoid mutating a prop directly" warnings
// ref: https://github.com/vuejs/vue-test-utils/issues/532
Vue.config.silent = true

Vue.use(Vuetify)
Vue.use(Vuelidate)

const vuetify = new Vuetify({})
const store = getVuexStore() as any // remove typings for unit tests

describe('AgmDate', () => {
  let wrapper: Wrapper<AgmDate>
  let vm: any

  beforeEach(() => {
    // init store
    store.state.entityIncNo = 'CP0001191'
    store.state.currentDate = '2019-07-15'
    store.state.currentYear = '2019'
    store.state.ARFilingYear = 2019
    store.state.arMinDate = '2019-01-01'
    store.state.arMaxDate = '2019-12-31'
    store.state.entityType = 'CP'
    store.state.lastAnnualReportDate = '2018-07-15'

    wrapper = mount(AgmDate, { store, vuetify })
    vm = wrapper.vm
  })

  afterEach(() => {
    wrapper.destroy()
    wrapper = null
  })

  xit('initializes the local variables properly', () => {
    // verify local variables
    expect(vm.$data.dateText).toBe('')
    expect(vm.$data.datePicker).toBe('2019-07-15')
    expect(vm.$data.agmExtension).toBe(false)
    expect(vm.$data.noAgm).toBe(false)

    // verify that checkbox is _not_ rendered (in current year)
    expect(vm.$el.querySelector('#no-agm-checkbox')).toBeNull()
  })

  it('renders checkbox in past year', () => {
    store.state.ARFilingYear = 2018

    // verify that checkbox is rendered
    expect(vm.$el.querySelector('#no-agm-checkbox')).not.toBeNull()
  })

  it('sets AGM Date when date picker is set', () => {
    wrapper.setData({ datePicker: '2019-05-10' })
    vm.onDatePickerChanged('2019-05-10')

    // verify local variables
    expect(vm.$data.dateText).toBe('2019-05-10')
    expect(vm.$data.datePicker).toBe('2019-05-10')
    expect(vm.$data.noAgm).toBe(false)

    // verify emitted AGM Dates
    const agmDates = wrapper.emitted('agmDate')
    expect(agmDates.length).toBe(1)
    expect(agmDates[0]).toEqual(['2019-05-10'])

    // verify emitted Valids
    const valids = wrapper.emitted('valid')
    expect(valids.length).toBe(1)
    expect(valids[0]).toEqual([true])
  })

  xit('sets No AGM when checkbox is checked', () => {
    wrapper.setData({ noAgm: true })
    vm.onCheckboxChanged(true)

    // verify local variables
    expect(vm.$data.dateText).toBe('')
    expect(vm.$data.datePicker).toBe('2019-07-15')
    expect(vm.$data.noAgm).toBe(true)

    // verify emitted AGM Dates
    const agmDates = wrapper.emitted('agmDate')
    expect(agmDates.length).toBe(1)
    expect(agmDates[0]).toEqual([''])

    // verify emitted No AGMs
    const noAgms = wrapper.emitted('noAgm')
    expect(noAgms.length).toBe(1)
    expect(noAgms[0]).toEqual([true])

    // verify emitted Valids
    const valids = wrapper.emitted('valid')
    expect(valids.length).toBe(1)
    expect(valids[0]).toEqual([true])
  })

  it('sets AGM Date when AGM Date prop is set to a date', () => {
    wrapper.setProps({ newAgmDate: '2019-05-10' })

    // verify local variables
    expect(vm.$data.dateText).toBe('2019-05-10')
    expect(vm.$data.datePicker).toBe('2019-05-10')
    expect(vm.$data.noAgm).toBe(false)

    // verify emitted AGM Dates
    const agmDates = wrapper.emitted('agmDate')
    expect(agmDates.length).toBe(1)
    expect(agmDates[0]).toEqual(['2019-05-10'])

    // verify emitted Valids
    const valids = wrapper.emitted('valid')
    expect(valids.length).toBe(1)
    expect(valids[0]).toEqual([true])
  })

  xit('clears AGM Date when AGM Date prop is set to empty', () => {
    wrapper.setProps({ newAgmDate: '' })

    // verify local variables
    expect(vm.$data.dateText).toBe('')
    expect(vm.$data.datePicker).toBe('2019-07-15')
    expect(vm.$data.noAgm).toBe(false)

    // verify emitted AGM Dates
    const agmDates = wrapper.emitted('agmDate')
    expect(agmDates.length).toBe(1)
    expect(agmDates[0]).toEqual([''])

    // verify emitted Valids
    const valids = wrapper.emitted('valid')
    expect(valids.length).toBe(1)
    expect(valids[0]).toEqual([false])
  })

  xit('sets No AGM when No AGM prop is set to true', () => {
    wrapper.setProps({ newNoAgm: true })

    // verify local variables
    expect(vm.$data.dateText).toBe('')
    expect(vm.$data.datePicker).toBe('2019-07-15')
    expect(vm.$data.noAgm).toBe(true)

    // verify emitted No AGMs
    const noAgms = wrapper.emitted('noAgm')
    expect(noAgms.length).toBe(1)
    expect(noAgms[0]).toEqual([true])

    // verify emitted Valids
    const valids = wrapper.emitted('valid')
    expect(valids.length).toBe(1)
    expect(valids[0]).toEqual([true])
  })

  xit('displays disabled address change message when allowCOA is false', () => {
    wrapper.setData({ dateText: '2019-07-15' })
    wrapper.setProps({ allowCOA: false })

    // verify validation error
    expect(vm.$el.querySelector('.restriction-messages').textContent.trim()).toContain(
      'You can not change your Registered Office Addresses in this Annual Report'
    )
  })

  xit('displays disabled director change message when allowCOD is false', () => {
    wrapper.setData({ dateText: '2019-07-15' })
    wrapper.setProps({ allowCOD: false })

    // verify validation error
    expect(vm.$el.querySelector('.restriction-messages').textContent.trim()).toContain(
      'You can not change your Directors in this Annual Report'
    )
  })

  xit('displays disabled address + director change message when allowCOA and allowCOD are both false', () => {
    wrapper.setData({ dateText: '2019-07-15' })
    wrapper.setProps({ allowCOA: false, allowCOD: false })

    // verify validation error
    expect(vm.$el.querySelector('.restriction-messages').textContent.trim()).toContain(
      'You can not change your Registered Office Addresses or Directors in this Annual Report'
    )
  })
})
