import Vue from 'vue'
import Vuetify from 'vuetify'
import { shallowMount } from '@vue/test-utils'
import { getVuexStore } from '@/store'
import { CancelPaymentErrorDialog } from '@/components/dialogs'

Vue.use(Vuetify)

const vuetify = new Vuetify({})
const store = getVuexStore() as any // remove typings for unit tests

describe('CancelPaymentErrorDialog - Displays Error/Warning messages', () => {
  it('displays generic message for normal users', () => {
    const wrapper = shallowMount(CancelPaymentErrorDialog,
      {
        propsData: {
          dialog: true
        },
        store,
        vuetify
      })

    expect(wrapper.find('#dialog-title').text()).toBe('Unable to Cancel Payment')
    expect(wrapper.find('#dialog-text').text())
      .toContain('We were unable to cancel your payment.')
    expect(wrapper.find('#dialog-text').text()).toContain('If you need help, please contact us.')
    expect(wrapper.find('#dialog-ok-btn')).toBeDefined()

    wrapper.destroy()
  })

  it('displays generic message for staff', () => {
    // init store
    store.state.keycloakRoles.push('staff')

    const wrapper = shallowMount(CancelPaymentErrorDialog,
      {
        propsData: {
          dialog: true
        },
        store,
        vuetify
      })

    expect(wrapper.find('#dialog-title').text()).toBe('Unable to Cancel Payment')
    expect(wrapper.find('#dialog-text').text())
      .toContain('We were unable to cancel your payment.')
    expect(wrapper.find('#dialog-text').text()).not.toContain('If you need help, please contact us.')
    expect(wrapper.find('#dialog-ok-btn')).toBeDefined()

    wrapper.destroy()
  })

  it('displays errors', () => {
    const wrapper = shallowMount(CancelPaymentErrorDialog,
      {
        propsData: {
          dialog: true,
          errors: [
            {
              error: 'Payment Service is not available',
              path: 'path/path'
            }
          ]
        },
        store,
        vuetify
      })

    expect(wrapper.find('#dialog-title').text()).toBe('Unable to Cancel Payment')
    expect(wrapper.find('#dialog-text').text())
      .toContain('We were unable to cancel your payment due to the following errors:')
    expect(wrapper.find('#dialog-text').text()).toContain('Payment Service is not available')
    expect(wrapper.find('#dialog-ok-btn')).toBeDefined()

    wrapper.destroy()
  })
})
