import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props={children:ReactNode;resetKey:string}
type State={failed:boolean}

export class RouteContentBoundary extends Component<Props,State>{
  state:State={failed:false}

  static getDerivedStateFromError():State{return {failed:true}}

  componentDidCatch(error:Error,info:ErrorInfo){
    console.error('Route render failed',error,info)
  }

  componentDidUpdate(prev:Props){
    if(this.state.failed&&prev.resetKey!==this.props.resetKey)this.setState({failed:false})
  }

  render(){
    if(!this.state.failed)return this.props.children
    return <div className="panel route-error-card">
      <span className="eyebrow">Ошибка экрана</span>
      <h3>Не удалось открыть этот раздел</h3>
      <p>Навигация остаётся доступна. Можно вернуться назад или открыть главную.</p>
      <div className="route-error-actions">
        <button className="ghost-button" onClick={()=>window.history.back()}>Назад</button>
        <a className="primary-button compact" href="#/">На главную</a>
      </div>
    </div>
  }
}
