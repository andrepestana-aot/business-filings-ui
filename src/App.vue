<template>
  <v-app class="app-container theme--light" id="app">
    <!-- Dialogs -->
    <DashboardUnavailableDialog
      :dialog="dashboardUnavailableDialog"
      @exit="onClickExit()"
      @retry="onClickRetry()"
      attach="#app"
    />

    <BusinessAuthErrorDialog
      :dialog="businessAuthErrorDialog"
      @exit="onClickExit()"
      @retry="onClickRetry(true)"
      attach="#app"
    />

    <NameRequestAuthErrorDialog
      :dialog="nameRequestAuthErrorDialog"
      @exit="onClickExit()"
      @retry="onClickRetry(true)"
      attach="#app"
    />

    <NameRequestInvalidDialog
      :dialog="nameRequestInvalidDialog"
      :type="nameRequestInvalidType"
      @exit="onClickExit()"
      @retry="onClickRetry()"
      attach="#app"
    />

    <!-- Initial Page Load Transition -->
    <v-fade-transition>
      <div class="loading-container" v-show="showLoadingContainer">
        <div class="loading__content">
          <v-progress-circular color="primary" size="50" indeterminate />
          <div class="loading-msg" v-if="!isSignoutRoute">Loading Dashboard</div>
        </div>
      </div>
    </v-fade-transition>

    <!-- Alternate Loading Spinner -->
    <v-fade-transition>
      <div class="loading-container grayed-out" v-show="showSpinner">
        <div class="loading__content">
          <v-progress-circular color="primary" size="50" indeterminate />
        </div>
      </div>
    </v-fade-transition>

    <SbcHeader />
    <PaySystemAlert />

    <div class="app-body">
      <!-- only show pages while signing in or once the data is loaded -->
      <main v-if="isSigninRoute || dataLoaded">
        <EntityInfo />
        <router-view />
      </main>
    </div>

    <SbcFooter :aboutText=aboutText />

  </v-app>
</template>

<script lang="ts">
// Libraries
import { mapActions, mapState } from 'vuex'
import axios from '@/axios-auth'
import KeycloakService from 'sbc-common-components/src/services/keycloak.services'
import * as Sentry from '@sentry/browser'
import { updateLdUser } from '@/utils'

// Components
import PaySystemAlert from 'sbc-common-components/src/components/PaySystemAlert.vue'
import SbcHeader from 'sbc-common-components/src/components/SbcHeader.vue'
import SbcFooter from 'sbc-common-components/src/components/SbcFooter.vue'
import EntityInfo from '@/components/EntityInfo.vue'

// Dialogs
import {
  BusinessAuthErrorDialog,
  DashboardUnavailableDialog,
  NameRequestAuthErrorDialog,
  NameRequestInvalidDialog
} from '@/components/dialogs'

// Mixins
import { CommonMixin, DirectorMixin, NameRequestMixin } from '@/mixins'

// Folder containing the array of configuration objects
import { configJson } from '@/resources'

// Enums and Constants
import { EntityStatus, FilingStatus, FilingTypes, NameRequestStates, Routes } from '@/enums'
import { SessionStorageKeys } from 'sbc-common-components/src/util/constants'
import { CorpTypeCd } from '@bcrs-shared-components/corp-type-module/corp-type-module'

export default {
  name: 'App',

  mixins: [CommonMixin, DirectorMixin, NameRequestMixin],

  data () {
    return {
      dataLoaded: false,
      dashboardUnavailableDialog: false,
      businessAuthErrorDialog: false,
      nameRequestAuthErrorDialog: false,
      nameRequestInvalidDialog: false,
      nameRequestInvalidType: null as NameRequestStates,
      localNrNumber: null as string,
      corpTypeCd: null as CorpTypeCd,

      /** Whether to show the alternate loading spinner. */
      showSpinner: false,

      /** Whether the token refresh service is initialized. */
      tokenService: false,

      /** Currently supported entity types in Filings UI. */
      supportedEntityTypes: [
        CorpTypeCd.BENEFIT_COMPANY,
        CorpTypeCd.BC_COMPANY,
        CorpTypeCd.BC_ULC_COMPANY,
        CorpTypeCd.BC_CCC,
        CorpTypeCd.COOP
      ],

      // enums
      EntityStatus,
      FilingStatus,
      FilingTypes
    }
  },

  components: {
    DashboardUnavailableDialog,
    BusinessAuthErrorDialog,
    NameRequestAuthErrorDialog,
    NameRequestInvalidDialog,
    PaySystemAlert,
    SbcHeader,
    SbcFooter,
    EntityInfo
  },

  computed: {
    ...mapState(['tasks', 'filings', 'entityType', 'entityStatus']),

    /** The Auth API string. */
    authApiUrl (): string {
      return sessionStorage.getItem('AUTH_API_URL')
    },

    /** The BCROS Home URL string. */
    bcrosHomeUrl (): string {
      return sessionStorage.getItem('BUSINESSES_URL')
    },

    /** The Business ID string. */
    businessId (): string {
      return sessionStorage.getItem('BUSINESS_ID')
    },

    /** The Incorporation Application's Temporary Registration Number string. */
    tempRegNumber (): string {
      return sessionStorage.getItem('TEMP_REG_NUMBER')
    },

    /** True if loading container should be shown. */
    showLoadingContainer (): boolean {
      return (!this.dataLoaded &&
        !this.dashboardUnavailableDialog &&
        !this.businessAuthErrorDialog &&
        !this.nameRequestAuthErrorDialog &&
        !this.nameRequestInvalidDialog)
    },

    /** True if route is Signin. */
    isSigninRoute (): boolean {
      return Boolean(this.$route.name === Routes.SIGNIN)
    },

    /** True if route is Signout. */
    isSignoutRoute (): boolean {
      return Boolean(this.$route.name === Routes.SIGNOUT)
    },

    /** True if user is authenticated. */
    isAuthenticated (): boolean {
      const keycloakToken = sessionStorage.getItem(SessionStorageKeys.KeyCloakToken)
      // FUTURE: also check that token isn't expired!
      return Boolean(keycloakToken)
    },

    /** The About text. */
    aboutText (): string {
      return process.env.ABOUT_TEXT
    }
  },

  created (): void {
    // listen for dashboard reload trigger events
    this.$root.$on('triggerDashboardReload', () => this.fetchData())

    // listen for spinner show/hide events
    this.$root.$on('showSpinner', (flag = false) => { this.showSpinner = flag })
  },

  async mounted (): Promise<void> {
    // do not fetch data if we need to authenticate
    // just let signin page do its thing
    if (!this.isAuthenticated) return

    // ...otherwise proceed
    await this.startTokenService()
    await this.fetchData()
  },

  destroyed (): void {
    // stop listening for dashboard reload trigger events
    this.$root.$off('triggerDashboardReload')

    // stop listening for spinner show/hide events
    this.$root.$off('showSpinner')
  },

  methods: {
    ...mapActions(['setKeycloakRoles', 'setAuthRoles', 'setBusinessEmail', 'setBusinessPhone',
      'setBusinessPhoneExtension', 'setCurrentDate', 'setEntityName', 'setEntityType', 'setEntityStatus',
      'setEntityBusinessNo', 'setEntityIncNo', 'setEntityFoundingDate', 'setTasks', 'setFilings',
      'setRegisteredAddress', 'setRecordsAddress', 'setDirectors', 'setLastAnnualReportDate',
      'setConfigObject', 'setNameRequest']),

    /** Starts token service to refresh KC token periodically. */
    async startTokenService (): Promise<void> {
      // only initialize once
      // don't start during Jest tests as it messes up the test JWT
      if (this.tokenService || this.isJestRunning) return Promise.resolve()

      try {
        console.info('Starting token refresh service...') // eslint-disable-line no-console
        await KeycloakService.initializeToken()
        this.tokenService = true
      } catch (err) {
        // happens when the refresh token has expired in session storage

        // eslint-disable-next-line no-console
        console.log('Could not initialize token refresher, err =', err)

        // clear old session variables and reload page to get new tokens
        this.clearKeycloakSession()
        location.reload()
      }
    },

    /** Clears Keycloak token information from session storage. */
    clearKeycloakSession (): void {
      sessionStorage.removeItem(SessionStorageKeys.KeyCloakToken)
      sessionStorage.removeItem(SessionStorageKeys.KeyCloakRefreshToken)
      sessionStorage.removeItem(SessionStorageKeys.KeyCloakIdToken)
      sessionStorage.removeItem(SessionStorageKeys.CurrentAccount)
    },

    /** Fetches business data / incorp app data. */
    async fetchData (): Promise<void> {
      this.dataLoaded = false

      // store today's date every time the dashboard is loaded
      // FUTURE: get from API to prevent users spoofing their date
      {
        const now = new Date()
        const date = this.dateToDateString(now)
        this.setCurrentDate(date)
      }

      try {
        // get Keycloak roles
        const jwt = this.getJWT()
        const keycloakRoles = this.getKeycloakRoles(jwt)
        this.setKeycloakRoles(keycloakRoles)

        // safety check
        if (!this.businessId && !this.tempRegNumber) {
          throw new Error('Missing Business ID or Temporary Registration Number')
        }

        // check if current user is authorized
        const authData = await this.getAuthorizations()
        this.storeAuthorizations(authData) // throws if no role
      } catch (err) {
        console.log(err) // eslint-disable-line no-console
        if (this.businessId) this.businessAuthErrorDialog = true
        if (this.tempRegNumber) this.nameRequestAuthErrorDialog = true
        return // do not execute remaining code
      }

      // fetch user info and update Launch Darkly
      try {
        const userInfo = await this.getUserInfo()
        await this.updateLaunchDarkly(userInfo)
      } catch (err) {
        // just log the error -- no need to halt app
        console.log('Launch Darkly update error =', err) // eslint-disable-line no-console
      }

      // is this a business entity?
      if (this.businessId) {
        try {
          await this.fetchBusinessData() // throws on error
          this.dataLoaded = true
        } catch (err) {
          console.log(err) // eslint-disable-line no-console
          this.dashboardUnavailableDialog = true
          // logging exception to sentry due to incomplete business data.
          // at this point system doesn't know why its incomplete.
          // since its not an expected behaviour it could be better to track.
          Sentry.captureException(err)
        }
      }

      // is this a draft incorp app entity?
      if (this.tempRegNumber) {
        try {
          await this.fetchIncorpAppData() // throws on error
          this.dataLoaded = true
        } catch (err) {
          console.log(err) // eslint-disable-line no-console
          this.nameRequestInvalidDialog = true
        }
      }
    },

    /** Fetches and stores the business data. */
    async fetchBusinessData (): Promise<void> {
      const data = await Promise.all([
        this.getBusinessInfo(),
        this.getEntityInfo(),
        this.getTasks(),
        this.getFilings(),
        this.getAddresses(),
        this.getDirectors()
      ])

      if (!data || data.length !== 6) throw new Error('Incomplete business data')

      this.storeBusinessInfo(data[0])
      this.storeEntityInfo(data[1])
      this.storeTasks(data[2])
      this.storeFilings(data[3])
      this.storeAddresses(data[4])
      this.storeDirectors(data[5])
    },

    /** Fetches and stores the incorp app data. */
    async fetchIncorpAppData (): Promise<void> {
      this.nameRequestInvalidType = null // reset for new fetches

      const iaData = await this.getIncorpApp()
      this.storeIncorpApp(iaData)

      if (this.localNrNumber) {
        const nrData = await this.getNameRequest()
        this.storeNrData(nrData, iaData)
      }
    },

    /** Gets Keycloak JWT and parses it. */
    getJWT (): any {
      const keycloakToken = sessionStorage.getItem(SessionStorageKeys.KeyCloakToken)
      if (keycloakToken) {
        return this.parseToken(keycloakToken)
      }
      throw new Error('Error getting Keycloak token')
    },

    /** Decodes and parses Keycloak token. */
    parseToken (token: string): any {
      try {
        const base64Url = token.split('.')[1]
        const base64 = decodeURIComponent(window.atob(base64Url).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        }).join(''))
        return JSON.parse(base64)
      } catch (err) {
        throw new Error('Error parsing token - ' + err)
      }
    },

    /** Gets Keycloak roles from JWT. */
    getKeycloakRoles (jwt: any): Array<string> {
      const keycloakRoles = jwt.roles
      if (keycloakRoles && keycloakRoles.length > 0) {
        return keycloakRoles
      }
      throw new Error('Error getting Keycloak roles')
    },

    /** Gets authorizations from Auth API. */
    getAuthorizations (): Promise<any> {
      const id = this.businessId || this.tempRegNumber
      const url = id + '/authorizations'
      const config = {
        baseURL: this.authApiUrl + 'entities/'
      }
      return axios.get(url, config)
    },

    storeAuthorizations (response: any): void {
      // NB: roles array may contain 'view', 'edit' or nothing
      const authRoles = response?.data?.roles
      if (authRoles && authRoles.length > 0) {
        this.setAuthRoles(authRoles)
      } else {
        throw new Error('Invalid auth roles')
      }
    },

    /** Fetches current user info. */
    async getUserInfo (): Promise<any> {
      const config = {
        baseURL: this.authApiUrl
      }
      return axios.get('users/@me', config)
        .then(response => {
          if (response?.data) return response.data
          else throw new Error('Invalid user info')
        })
    },

    /** Updates Launch Darkly with current user info. */
    async updateLaunchDarkly (userInfo: any): Promise<void> {
      // since username is unique, use it as the user key
      const key: string = userInfo.username
      const email: string = userInfo.contacts[0]?.email || userInfo.email
      const firstName: string = userInfo?.firstname
      const lastName: string = userInfo?.lastname
      // remove leading { and trailing } and tokenize string
      const custom: any = { roles: userInfo.roles?.slice(1, -1).split(',') }

      await updateLdUser(key, email, firstName, lastName, custom)
    },

    /** Gets business info from Auth API. */
    getBusinessInfo (): Promise<any> {
      const url = this.businessId
      const config = {
        baseURL: this.authApiUrl + 'entities/'
      }
      return axios.get(url, config)
    },

    storeBusinessInfo (response: any): void {
      const contacts = response?.data?.contacts
      // ensure we received the right looking object
      // but allow empty contacts array
      if (contacts) {
        // at this time there is at most 1 contact
        const contact = contacts.length > 0 && contacts[0]
        if (contact) {
          this.setBusinessEmail(contact.email)
          this.setBusinessPhone(contact.phone)
          this.setBusinessPhoneExtension(contact.phoneExtension)
        }
        // save Corp Type Code locally to compare with Legal Type below
        this.corpTypeCd = response?.data?.corpType?.code
      } else {
        throw new Error('Invalid business contact info')
      }
    },

    /** Gets entity info from Legal API. */
    getEntityInfo (): Promise<any> {
      const url = `businesses/${this.businessId}`
      return axios.get(url)
    },

    storeEntityInfo (response: any): void {
      const business = response?.data?.business

      if (!business) {
        throw new Error('Invalid entity info')
      }

      if (this.businessId !== business.identifier) {
        throw new Error('Business identifier mismatch')
      }

      // these should match, but don't error out if they don't
      // hopefully ops will see this error in Sentry
      if (this.corpTypeCd && business.legalType !== this.corpTypeCd) {
        // eslint-disable-next-line no-console
        console.error('WARNING: Legal Type in Legal db does not match Corp Type in Auth db!')
      }

      this.setEntityName(business.legalName)
      this.setEntityType(business.legalType)
      if (business.goodStanding === true) {
        this.setEntityStatus(EntityStatus.GOOD_STANDING)
      } else {
        this.setEntityStatus(EntityStatus.NOT_IN_COMPLIANCE)
      }
      this.setEntityBusinessNo(business.taxId)
      this.setEntityIncNo(business.identifier)
      this.setEntityFoundingDate(business.foundingDate) // datetime
      this.setLastAnnualReportDate(business.lastAnnualReport)
      this.storeConfigObject(business.legalType)
    },

    /** Gets the Incorp App filing from Legal API. */
    getIncorpApp (): Promise<any> {
      const url = `businesses/${this.tempRegNumber}/filings`
      return axios.get(url)
        // workaround because data is at "response.data.data"
        .then(response => Promise.resolve(response.data))
    },

    storeIncorpApp (data: any): void {
      const filing = data?.filing

      if (!filing?.business || !filing?.header) {
        throw new Error('Invalid incorporation application filing')
      }

      // verify that this is the correct entity type
      if (!this.supportedEntityTypes.includes(filing.business.legalType)) {
        throw new Error('Invalid business legal type')
      }

      // verify that this is the correct filing type
      if (filing.header.name !== FilingTypes.INCORPORATION_APPLICATION) {
        throw new Error('Invalid incorporation application name')
      }

      // store business info
      this.setEntityIncNo(filing.business.identifier)
      this.setEntityType(filing.business.legalType)

      // store NR Number if present
      const nr = filing.incorporationApplication?.nameRequest
      // workaround for old or new property name
      this.localNrNumber = nr?.nrNum || nr?.nrNumber

      switch (filing.header.status) {
        case 'DRAFT':
        case 'PENDING':
          // this is a Draft Incorporation Application
          this.setEntityStatus(EntityStatus.DRAFT_INCORP_APP)

          this.setTasks([
            {
              enabled: true,
              order: 1,
              task: {
                filing
              }
            }
          ])
          break

        case 'COMPLETED':
        case 'PAID':
          const incorporationApplication = filing.incorporationApplication
          if (!incorporationApplication) {
            throw new Error('Invalid incorporation application object')
          }

          // this is a paid or completed Incorporation Application
          this.setEntityStatus(EntityStatus.FILED_INCORP_APP)

          // set temporary addresses and directors
          this.storeAddresses({ data: incorporationApplication.offices })
          const directors = incorporationApplication.parties.filter((party) => party.roles.filter((role) =>
            role.roleType === 'Director').length !== 0)
          this.storeDirectors({ data: { directors: [...directors] } })

          this.setFilings([{ filing }])
          break

        default:
          throw new Error('Invalid incorporation application status')
      }
    },

    /** Gets NR data from Legal API. */
    getNameRequest (): Promise<any> {
      const url = `nameRequests/${this.localNrNumber}`
      return axios.get(url)
        // workaround because data is at "response.data.data"
        .then(response => Promise.resolve(response.data))
    },

    storeNrData (nr: any, ia: any): void {
      // check if NR is valid
      if (!this.isNrValid(nr)) {
        this.nameRequestInvalidDialog = true
        throw new Error('Invalid NR data')
      }

      // FUTURE: uncomment this when Request Type Code is fixed (ie, not 'CR')
      // // verify that NR type matches entity type
      // if (nr.requestTypeCd !== this.entityType) {
      //   this.nameRequestInvalidDialog = true
      //   throw new Error('Invalid NR request type')
      // }

      // Check NR is consumable if filing is not COMPLETED. Once filing is completed the NR state will be CONSUMED
      if (ia.filing.header.status !== FilingStatus.COMPLETED) {
        const nrState: NameRequestStates = this.getNrState(nr)
        if (nrState !== NameRequestStates.APPROVED && nrState !== NameRequestStates.CONDITIONAL) {
          this.nameRequestInvalidDialog = true
          this.nameRequestInvalidType = nrState
          throw new Error('NR not consumable')
        }
      }

      // save the NR
      this.setNameRequest(nr)

      // save the approved name
      const entityName = this.getApprovedName(nr)
      this.setEntityName(entityName || 'Unknown Name')
    },

    /** Gets tasks list from Legal API. */
    getTasks (): Promise<any> {
      const id = this.businessId
      const url = `businesses/${id}/tasks`
      return axios.get(url)
    },

    storeTasks (response: any): void {
      const tasks = response?.data?.tasks
      if (tasks) {
        this.setTasks(tasks)
      } else {
        throw new Error('Invalid tasks')
      }
    },

    /** Gets filings list from Legal API. */
    getFilings (): Promise<any> {
      const id = this.businessId || this.tempRegNumber
      const url = `businesses/${id}/filings`
      return axios.get(url)
    },

    storeFilings (response: any): void {
      const filings = response?.data?.filings
      if (filings) {
        this.setFilings(filings)
      } else {
        throw new Error('Invalid filings')
      }
    },

    /** Gets addresses from Legal API. */
    getAddresses (): Promise<any> {
      const url = `businesses/${this.businessId}/addresses`
      return axios.get(url)
    },

    storeAddresses (response: any): void {
      if (response?.data) {
        if (response.data.registeredOffice) {
          this.setRegisteredAddress(this.omitProps(response.data.registeredOffice,
            ['deliveryAddress', 'mailingAddress'], ['addressType']))
        }
        if (response.data.recordsOffice) {
          this.setRecordsAddress(this.omitProps(response.data.recordsOffice,
            ['deliveryAddress', 'mailingAddress'], ['addressType']))
        }
      } else {
        throw new Error('invalid office addresses')
      }
    },

    /** Gets directors list from Legal API. */
    getDirectors (): Promise<any> {
      const url = `businesses/${this.businessId}/directors`
      return axios.get(url)
    },

    storeDirectors (response: any): void {
      const directors = response?.data?.directors
      if (directors) {
        const directorsSorted = directors.sort(this.fieldSorter(['lastName', 'firstName', 'middleName']))
        for (var i = 0; i < directorsSorted.length; i++) {
          directorsSorted[i].id = i + 1
          directorsSorted[i].isNew = false
          directorsSorted[i].isDirectorActive = true
        }
        this.setDirectors(directorsSorted)
      } else {
        throw new Error('Invalid directors')
      }
    },

    /** Stores config object matching this business' legal type. */
    storeConfigObject (entityType: string): void {
      const configObject = configJson.find(x => x.entityType === entityType)
      this.setConfigObject(configObject)
    },

    /** Handles Exit click event from dialogs. */
    onClickExit (): void {
      window.location.assign(this.bcrosHomeUrl) // assume URL is always reachable
    },

    /** Handles Retry click event from dialogs. */
    onClickRetry (hard = false): void {
      if (hard) {
        // clear KC session variables and hard-reload the page
        // to force new login and try again
        this.clearKeycloakSession()
        location.reload()
      } else {
        // try to fetch the data again
        this.dashboardUnavailableDialog = false
        this.businessAuthErrorDialog = false
        this.nameRequestAuthErrorDialog = false
        this.nameRequestInvalidDialog = false
        this.fetchData()
      }
    }
  },

  watch: {
    async '$route' (): Promise<void> {
      // if we (re)route to the dashboard then re-fetch all data
      // - does not fire on initial dashboard load
      // - fires after successful signin
      if (this.$route.name === Routes.DASHBOARD) {
        await this.startTokenService()
        await this.fetchData()
      }
    }
  }
}
</script>

<style lang="scss">
.loading-container.grayed-out {
  // these are the same styles as dialog overlay:
  opacity: 0.46;
  background-color: rgb(33, 33, 33); // grey darken-4
  border-color: rgb(33, 33, 33); // grey darken-4
}
</style>
