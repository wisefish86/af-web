import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props={children:ReactNode}
type State={failed:boolean}

export class AppErrorBoundary extends Component<Props,State>{
  state:State={failed:false}

  static getDerivedStateFromError():State{
    return {failed:true}
  }

  componentDidCatch(error:Error,info:ErrorInfo){
    console.error('Andrey-Fit render failed',error,info)
  }

  render(){
    if(!this.state.failed)return this.props.children
    return <div className="auth-issue-screen">
      <div className="auth-issue-card">
        <strong>Не удалось открыть приложение</strong>
        <p>Произошла ошибка интерфейса. Данные не потеряны — перезапусти приложение.</p>
        <div><button className="primary-button compact" onClick={()=>window.location.reload()}>Повторить</button></div>
      </div>
    </div>
  }
}
